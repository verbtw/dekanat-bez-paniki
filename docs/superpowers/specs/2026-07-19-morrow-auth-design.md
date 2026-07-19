# Morrow Authentication and Workspace Membership Design

**Status:** Approved for implementation
**Date:** 2026-07-19

## Goal

Add production-ready registration and sign-in to Morrow, connect authenticated users to one or more workspaces, and replace browser access-token authorization with session-backed membership checks without losing existing groups, events, sources, or Telegram behavior.

## Product decisions

- Use the current Neon Auth SDK for identity, credentials, session cookies, email verification, and password recovery.
- Start with email and password. OAuth providers may be enabled later without changing Morrow's authorization model.
- Keep the public local-only demo available without an account.
- Require an authenticated user and an active workspace membership for every non-demo web read or mutation.
- Support multiple workspaces per user with `owner`, `admin`, and `member` roles.
- Preserve Russian and English UI, light and dark themes, and the existing Telegram-first workflow.
- Do not build or store passwords, password hashes, or custom session tokens in application tables.

## Alternatives considered

### Neon Auth — selected

Neon Auth fits the existing Next.js, Vercel, and Neon stack. The current Vercel integration already provides the branch-specific Auth URL, authentication data branches with the database, and application code can retrieve a server-validated session before accessing Drizzle repositories.

### Clerk

Clerk has polished hosted UI and user management, but it would add a second identity platform and another source of operational configuration. It does not improve Morrow's workspace authorization layer enough to justify that split.

### Self-hosted Better Auth

This provides maximum control, but Morrow would own more security-sensitive configuration, schema maintenance, email delivery, and session operations. That is unnecessary for the portfolio and product goals.

## Architecture

```text
Browser ──▶ Neon Auth route ──▶ neon_auth schema
   │              │
   │         signed session cookie
   ▼              ▼
Morrow API ──▶ requireSession() ──▶ requireMembership(groupId)
                                            │
                                            ▼
                                  Drizzle repositories
                                            │
                                            ▼
                                      groups/events

Telegram ── secret header ──▶ webhook ── trusted server lookup ──▶ group
```

Neon Auth is responsible only for identity and sessions. Morrow remains responsible for authorization: which authenticated user may access which group and what that role permits.

The server exposes one central authorization path:

1. Read and validate the Neon Auth session.
2. Resolve the requested group from a stable group ID, never from an untrusted membership claim.
3. Load the user's membership for that group.
4. Enforce the minimum role required by the operation.
5. Pass the authorized group ID to repositories so every query remains group-scoped.

Telegram webhook and cron requests do not impersonate users. They retain their existing server-to-server authentication and operate on a group resolved from trusted Telegram or cron context.

## Data model

### `user_profiles`

- `user_id` text primary key, matching Neon Auth's user ID
- `display_name` text nullable
- `locale` enum-like text: `ru` or `en`
- `created_at`, `updated_at`

Authentication remains usable even if a profile has not yet been created. The application creates or updates the profile idempotently after the first authenticated request.

### `group_memberships`

- `id` UUID primary key
- `group_id` text foreign key to `groups`, cascade on delete
- `user_id` text
- `role` enum-like text: `owner`, `admin`, or `member`
- `created_at`, `updated_at`
- unique constraint on `(group_id, user_id)`
- indexes on `user_id` and `group_id`

Role capabilities:

| Capability | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read and edit events | Yes | Yes | Yes |
| Manage Telegram trust and briefs | Yes | Yes | No |
| Invite members | Yes | Yes | No |
| Change roles | Yes | No | No |
| Remove workspace or transfer ownership | Yes | No | No |

The database and service layer must prevent a workspace from being left without an owner.

### `group_invitations`

- `id` UUID primary key
- `group_id` text foreign key to `groups`, cascade on delete
- `created_by_user_id` text
- `token_hash` text unique
- `role` enum-like text limited to `admin` or `member`
- `expires_at`, `accepted_at`, `revoked_at`, `created_at`

Only a cryptographic hash of an invitation token is stored. Acceptance is transactional and idempotent: a valid invitation creates the membership at most once and marks the invitation accepted.

### `workspace_activities`

- `id` UUID primary key
- `group_id` text foreign key to `groups`, cascade on delete
- `actor_user_id` text nullable for trusted system actions
- `action` text
- `details` JSONB containing non-secret metadata
- `created_at`

This append-only audit trail records membership, invitation, workspace-claim, role-change, and ownership-transfer actions. Raw claim and invitation tokens are never stored in activity details.

## Existing workspace migration

The migration is additive. Existing `groups`, `events`, `sources`, and `event_activities` are not rewritten or deleted.

The existing `groups.access_token` remains temporarily available only as a workspace claim credential and for compatibility during rollout. It will no longer authorize ordinary browser API reads or writes after session enforcement is enabled.

Calendar subscriptions cannot use browser sessions, so they receive a separate revocable `calendar_subscription_token`. Existing calendar URLs using the legacy access token remain read-only during a documented compatibility window; the workspace settings screen exposes the replacement URL and lets an owner rotate it. Legacy tokens never authorize event mutations after rollout.

An authenticated user opening a valid legacy workspace link sees a claim screen. If the workspace has no owner, confirmation creates an `owner` membership. If an owner already exists, the token cannot silently grant membership; the user must use a current invitation. Claiming is transactional so two simultaneous requests cannot both become the initial owner.

## Routes and screens

Public routes:

- `/auth/sign-in`
- `/auth/sign-up`
- `/auth/forgot-password`
- Neon Auth handler under `/api/auth/[...path]`
- existing local-only demo entry
- invitation and legacy claim landing screens, which require sign-in before acceptance

Protected application behavior:

- The main workspace renders dynamically from the current session.
- First-time users see onboarding with `Create workspace` and `Connect existing workspace` actions.
- The header shows the active workspace, a workspace switcher, account menu, and sign-out.
- Authentication and onboarding screens use the existing Morrow visual language, RU/EN copy, theme switcher, keyboard focus states, and mobile layouts.
- A signed-out user visiting a protected URL returns to it after successful sign-in.

## API authorization contract

- `401 Unauthorized`: no valid session.
- `403 Forbidden`: a session exists but lacks required membership or role.
- `404 Not Found`: an authorized lookup cannot find the requested resource.
- Invitation and claim endpoints use generic invalid-link responses so they do not reveal workspace details before authorization.

API callers send stable resource or workspace IDs. Browser workspace access tokens are not accepted as authorization. Client-visible responses never include Auth secrets, cookie secrets, invitation hashes, Telegram tokens, webhook secrets, or database credentials.

Event IDs and source IDs continue to be checked for cross-group ownership before upserts. Membership authorization is an additional boundary, not a replacement for repository-level ownership protection.

## Failure handling

- Missing Auth configuration fails closed with a clear server-side diagnostic; production never falls back to anonymous database access.
- Profile creation, workspace creation, claiming, and invitation acceptance are idempotent.
- A failed membership lookup cannot reveal whether another workspace or event exists.
- Auth forms display localized, actionable validation errors without exposing provider internals.
- Network failures preserve typed form input and allow retry; they do not create duplicate workspaces or memberships.
- Existing Telegram ingestion and cron jobs continue even when no web user is signed in.

## Security and operations

- Configure `NEON_AUTH_BASE_URL` and a stable, generated `NEON_AUTH_COOKIE_SECRET` of at least 32 characters in local and protected Vercel environments.
- Use secure, HTTP-only session cookies through the Neon Auth SDK.
- Keep secrets out of the client bundle, logs, repository, test fixtures, and error bodies.
- Rate limiting and abuse protection remain the provider's responsibility for credential endpoints; Morrow applies conservative limits to claim and invitation acceptance endpoints.
- Record membership, invitation, ownership-transfer, and workspace-claim changes in an application audit trail without logging raw tokens.
- Add security headers and no-index metadata to authentication callback/error pages where appropriate.

## Testing strategy

Implementation follows test-driven development.

Unit and service tests cover:

- role capability decisions;
- session, membership, and minimum-role guards;
- missing, expired, revoked, reused, and concurrent invitation acceptance;
- first-owner claim races and repeat claims;
- locale-aware validation and safe error mapping.

Repository and route tests cover:

- migration constraints and cascade behavior;
- `401`, `403`, and `404` boundaries;
- rejection of legacy access tokens as ordinary web authorization;
- cross-workspace event and source isolation;
- unchanged Telegram webhook and cron authentication.

Browser-level verification covers:

1. Sign up and verify the account.
2. Create or claim a workspace.
3. Create and edit an event.
4. Switch between two workspaces without data leakage.
5. Invite and accept a second member.
6. Sign out and confirm protected access is denied.
7. Repeat the core flow in Russian and English, mobile and desktop, light and dark themes.

## Rollout

1. Add Auth SDK configuration and additive database migrations.
2. Add session and membership helpers with tests.
3. Add auth, onboarding, claim, invitation, and account UI.
4. Convert web APIs from workspace-token checks to membership checks.
5. Run migrations and full verification on a preview deployment.
6. Verify existing production Telegram ingestion, cron, calendar, and event data.
7. Deploy production and monitor Auth errors, authorization denials, and claim conflicts.

The release is not complete until production registration, sign-in, sign-out, workspace creation or claim, event mutation, and Telegram ingestion have all been verified.

## Non-goals for this release

- Paid plans or billing.
- University-wide SSO.
- Mandatory OAuth providers.
- Native mobile authentication.
- Fine-grained permissions below the three workspace roles.
- Deleting legacy access-token columns before the compatibility window is complete.

# Morrow Authentication and Workspace Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-ready Neon Auth registration, session-backed workspace authorization, onboarding, roles, invitations, and safe migration from legacy workspace links.

**Architecture:** Neon Auth owns identity and signed sessions; Morrow owns profiles, workspace memberships, invitations, calendar credentials, and authorization. Every browser database request resolves the Neon session and an application membership before it reaches group-scoped repositories, while Telegram and cron retain their server-to-server trust boundaries.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5, `@neondatabase/auth` 0.4.2-beta, Neon PostgreSQL, Drizzle ORM 0.45.2, Zod 4.4.3, Vitest 4.1.10, Playwright.

## Global Constraints

- Preserve all existing groups, events, sources, event activities, Telegram webhook behavior, cron behavior, RU/EN support, and light/dark themes.
- Start with email/password; OAuth is outside this release.
- Never store application passwords, raw invitation tokens, raw claim tokens, Telegram secrets, Auth cookie secrets, or database credentials.
- Keep the public demo local-only and usable without registration.
- Require a session and membership for all non-demo browser database reads and writes.
- Keep legacy calendar URLs read-only during the compatibility window; never let them mutate events.
- Follow red-green-refactor for every behavior change and commit after each task.

## File structure

New focused modules:

- `src/lib/auth/server.ts`: Neon Auth server singleton and environment validation.
- `src/lib/auth/client.ts`: Neon Auth browser client.
- `src/lib/auth/session.ts`: normalized current-user lookup.
- `src/lib/auth/access-control.ts`: role ordering and authorization errors.
- `src/lib/auth/workspace-guard.ts`: session plus membership boundary for routes.
- `src/lib/auth/validation.ts`: localized auth/workspace form schemas.
- `src/db/workspace-repository.ts`: profiles, memberships, invitations, claims, and workspace audit operations.
- `src/app/api/auth/[...path]/route.ts`: Neon Auth handler.
- `src/app/api/session/route.ts`: safe session payload for the client shell.
- `src/app/api/workspaces/**`: list, create, claim, invite, accept, and calendar-token operations.
- `src/components/auth/auth-shell.tsx`: shared Morrow auth layout.
- `src/components/auth/auth-form.tsx`: sign-in, sign-up, and recovery forms.
- `src/components/workspace-onboarding.tsx`: first-workspace flow.
- `src/components/workspace-switcher.tsx`: active workspace and account controls.
- `src/lib/api-client.ts`: credentialed workspace API calls without access tokens.
- `e2e/auth-workspace.spec.ts`: browser-level production flow.

Existing files changed:

- `package.json`, `package-lock.json`, `.env.example`: SDK, browser tests, scripts, and Auth configuration.
- `src/db/schema.ts`, `drizzle/*`: additive application authorization schema.
- `src/db/repository.ts`: group lookups and calendar-token compatibility only.
- `src/app/page.tsx`, `src/components/evidence-desk.tsx`, `src/app/globals.css`, `src/lib/ui-i18n.ts`: authenticated shell and polished bilingual UI.
- `src/app/api/events/route.ts`, `src/app/api/events/[id]/route.ts`: session/membership authorization.
- `src/app/api/calendar/route.ts`: separate calendar subscription credential.
- `docs/architecture.md`, `README.md`: new trust boundaries and setup.

---

### Task 1: Neon Auth foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Create: `src/lib/auth/config.ts`
- Create: `src/lib/auth/config.test.ts`
- Create: `src/lib/auth/server.ts`
- Create: `src/lib/auth/client.ts`
- Create: `src/app/api/auth/[...path]/route.ts`
- Create: `src/app/api/session/route.ts`

**Interfaces:**
- Produces: `getAuthConfig(env): { baseUrl: string; cookieSecret: string }`
- Produces: `auth`, `authClient`, and `GET`/`POST` Auth handlers.
- Produces: `GET /api/session` returning `{ user: { id, email, name } | null }`.

- [ ] **Step 1: Write the failing configuration tests**

```ts
import { describe, expect, it } from "vitest";
import { getAuthConfig } from "./config";

describe("getAuthConfig", () => {
  it("requires a branch auth URL", () => {
    expect(() => getAuthConfig({ NEON_AUTH_COOKIE_SECRET: "x".repeat(32) })).toThrow("NEON_AUTH_BASE_URL");
  });

  it("rejects short cookie secrets", () => {
    expect(() => getAuthConfig({ NEON_AUTH_BASE_URL: "https://auth.example.test", NEON_AUTH_COOKIE_SECRET: "short" })).toThrow("32 characters");
  });

  it("returns valid explicit configuration", () => {
    expect(getAuthConfig({ NEON_AUTH_BASE_URL: "https://auth.example.test", NEON_AUTH_COOKIE_SECRET: "x".repeat(32) })).toEqual({
      baseUrl: "https://auth.example.test",
      cookieSecret: "x".repeat(32),
    });
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/lib/auth/config.test.ts`
Expected: FAIL because `src/lib/auth/config.ts` does not exist.

- [ ] **Step 3: Install the SDK and implement explicit configuration**

Run: `npm install @neondatabase/auth@0.4.2-beta && npm install -D @playwright/test`

```ts
// src/lib/auth/config.ts
export function getAuthConfig(env: Record<string, string | undefined>) {
  const baseUrl = env.NEON_AUTH_BASE_URL?.trim();
  const cookieSecret = env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!baseUrl) throw new Error("NEON_AUTH_BASE_URL is required");
  if (!cookieSecret || cookieSecret.length < 32) {
    throw new Error("NEON_AUTH_COOKIE_SECRET must be at least 32 characters");
  }
  return { baseUrl, cookieSecret };
}
```

```ts
// src/lib/auth/server.ts
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { getAuthConfig } from "./config";

const config = getAuthConfig(process.env);
export const auth = createNeonAuth({
  baseUrl: config.baseUrl,
  cookies: { secret: config.cookieSecret },
});
```

```ts
// src/lib/auth/client.ts
"use client";
import { createAuthClient } from "@neondatabase/auth/next";
export const authClient = createAuthClient();
```

```ts
// src/app/api/auth/[...path]/route.ts
import { auth } from "@/lib/auth/server";
export const { GET, POST } = auth.handler();
```

Implement `/api/session` by calling `auth.getSession()` and returning only `id`, `email`, and `name`. Add `NEON_AUTH_BASE_URL=` and `NEON_AUTH_COOKIE_SECRET=` to `.env.example`; add `test:e2e` and `test:e2e:ui` scripts without inserting real values.

- [ ] **Step 4: Verify Auth foundation**

Run: `npm test -- src/lib/auth/config.test.ts && npm run lint && npm run build`
Expected: tests PASS, lint exits 0, build includes `/api/auth/[...path]` and `/api/session`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example src/lib/auth src/app/api/auth src/app/api/session
git commit -m "Add Neon Auth foundation"
```

### Task 2: Authorization schema and role policy

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/lib/auth/access-control.ts`
- Create: `src/lib/auth/access-control.test.ts`
- Create: generated `drizzle/0005_*.sql`
- Modify: generated `drizzle/meta/_journal.json`
- Create or modify: generated `drizzle/meta/0005_snapshot.json`

**Interfaces:**
- Produces: `WorkspaceRole = "owner" | "admin" | "member"`.
- Produces: `can(role, capability): boolean` and `assertRole(role, minimum): void`.
- Produces: Drizzle tables `userProfiles`, `groupMemberships`, `groupInvitations`, `workspaceActivities` and `groups.calendarSubscriptionToken`.

- [ ] **Step 1: Write failing role tests**

```ts
import { describe, expect, it } from "vitest";
import { assertRole, can } from "./access-control";

describe("workspace access control", () => {
  it("allows all members to edit events", () => {
    expect(can("member", "edit_events")).toBe(true);
  });
  it("limits invitations to admins and owners", () => {
    expect(can("member", "invite_members")).toBe(false);
    expect(can("admin", "invite_members")).toBe(true);
  });
  it("limits role changes to owners", () => {
    expect(() => assertRole("admin", "owner")).toThrow("FORBIDDEN");
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/lib/auth/access-control.test.ts`
Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the policy and additive schema**

```ts
export type WorkspaceRole = "owner" | "admin" | "member";
export type WorkspaceCapability = "edit_events" | "manage_settings" | "invite_members" | "change_roles" | "delete_workspace";
const rank: Record<WorkspaceRole, number> = { member: 1, admin: 2, owner: 3 };
const minimum: Record<WorkspaceCapability, WorkspaceRole> = {
  edit_events: "member",
  manage_settings: "admin",
  invite_members: "admin",
  change_roles: "owner",
  delete_workspace: "owner",
};
export function can(role: WorkspaceRole, capability: WorkspaceCapability) {
  return rank[role] >= rank[minimum[capability]];
}
export function assertRole(actual: WorkspaceRole, required: WorkspaceRole) {
  if (rank[actual] < rank[required]) throw new Error("FORBIDDEN");
}
```

Add Drizzle enums for workspace role and locale; add the four tables and relations from the approved design. Add a nullable, unique `calendar_subscription_token` to `groups` with `gen_random_uuid()::text` default for new rows. Keep `access_token` untouched and backfill calendar tokens in generated SQL with `UPDATE groups SET calendar_subscription_token = gen_random_uuid()::text WHERE calendar_subscription_token IS NULL`.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate && npm test -- src/lib/auth/access-control.test.ts && npm run build`
Expected: one additive migration, role tests PASS, build exits 0; migration contains no `DROP TABLE`, `DROP COLUMN`, or data deletion.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/lib/auth/access-control.ts src/lib/auth/access-control.test.ts drizzle
git commit -m "Add workspace authorization schema"
```

### Task 3: Workspace repository and transactional claims

**Files:**
- Create: `src/db/workspace-repository.ts`
- Create: `src/lib/auth/invitations.ts`
- Create: `src/lib/auth/invitations.test.ts`
- Modify: `src/db/repository.ts`

**Interfaces:**
- Produces: `hashCredential(token: string): string` using SHA-256.
- Produces: `listUserWorkspaces(userId)`, `createWorkspace(input)`, `getMembership(userId, groupId)`, `claimLegacyWorkspace(input)`, `createInvitation(input)`, `acceptInvitation(input)`, and `rotateCalendarToken(input)`.
- Consumes: schema and `WorkspaceRole` from Task 2.

- [ ] **Step 1: Write failing credential tests**

```ts
import { describe, expect, it } from "vitest";
import { hashCredential, invitationState } from "./invitations";

describe("workspace invitations", () => {
  it("hashes tokens deterministically without retaining plaintext", () => {
    expect(hashCredential("secret-token")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCredential("secret-token")).not.toContain("secret-token");
  });
  it("rejects expired, revoked, and accepted invitations", () => {
    const now = new Date("2026-07-19T12:00:00Z");
    expect(invitationState({ expiresAt: new Date("2026-07-19T11:00:00Z"), acceptedAt: null, revokedAt: null }, now)).toBe("expired");
    expect(invitationState({ expiresAt: new Date("2026-07-20T11:00:00Z"), acceptedAt: now, revokedAt: null }, now)).toBe("accepted");
    expect(invitationState({ expiresAt: new Date("2026-07-20T11:00:00Z"), acceptedAt: null, revokedAt: now }, now)).toBe("revoked");
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/lib/auth/invitations.test.ts`
Expected: FAIL because invitation helpers do not exist.

- [ ] **Step 3: Implement pure helpers and repository transactions**

```ts
import { createHash } from "node:crypto";
export function hashCredential(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
export function invitationState(row: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }, now = new Date()) {
  if (row.revokedAt) return "revoked" as const;
  if (row.acceptedAt) return "accepted" as const;
  if (row.expiresAt <= now) return "expired" as const;
  return "active" as const;
}
```

Use Drizzle transactions for workspace creation plus owner membership, first-owner claim, invitation acceptance, role changes, and calendar rotation. Lock the target group before a first-owner claim, check for an existing owner inside the transaction, insert with `onConflictDoNothing`, and append a `workspace_activities` row. Return generic `INVALID_INVITATION` and `CLAIM_UNAVAILABLE` errors without workspace metadata.

- [ ] **Step 4: Run focused and full tests**

Run: `npm test -- src/lib/auth/invitations.test.ts && npm test && npm run build`
Expected: focused and full suites PASS; TypeScript accepts all repository return types.

- [ ] **Step 5: Commit**

```bash
git add src/db/workspace-repository.ts src/db/repository.ts src/lib/auth/invitations.ts src/lib/auth/invitations.test.ts
git commit -m "Add workspace membership repository"
```

### Task 4: Session and workspace guards

**Files:**
- Create: `src/lib/auth/workspace-guard.ts`
- Create: `src/lib/auth/workspace-guard.test.ts`
- Create: `src/lib/http-error.ts`

**Interfaces:**
- Produces: `requireUser(): Promise<AuthenticatedUser>`.
- Produces: `requireWorkspaceAccess(groupId, minimumRole?): Promise<{ user; group; membership }>`.
- Produces: `toErrorResponse(error): NextResponse` mapping 401/403/404 without leaking resource existence.

- [ ] **Step 1: Write failing guard tests with injected dependencies**

```ts
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceGuard } from "./workspace-guard";

describe("workspace guard", () => {
  it("returns 401 without a session", async () => {
    const guard = createWorkspaceGuard({ getUser: vi.fn().mockResolvedValue(null), getMembership: vi.fn() });
    await expect(guard("group:1")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });
  it("returns 403 without membership", async () => {
    const guard = createWorkspaceGuard({ getUser: vi.fn().mockResolvedValue({ id: "u1", email: "u@example.test", name: "U" }), getMembership: vi.fn().mockResolvedValue(null) });
    await expect(guard("group:1")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/lib/auth/workspace-guard.test.ts`
Expected: FAIL because the guard module does not exist.

- [ ] **Step 3: Implement dependency-injected guards**

Create `HttpError` with `status`, `code`, and safe public message. Make `createWorkspaceGuard(dependencies)` the testable pure boundary and export a production `requireWorkspaceAccess` wired to `auth.getSession()` and `getMembership()`. Check the minimum role with `assertRole` and map its failure to `403`.

- [ ] **Step 4: Verify guard behavior**

Run: `npm test -- src/lib/auth/workspace-guard.test.ts src/lib/auth/access-control.test.ts && npm run build`
Expected: PASS and no client module imports `src/lib/auth/server.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/workspace-guard.ts src/lib/auth/workspace-guard.test.ts src/lib/http-error.ts
git commit -m "Enforce workspace membership guards"
```

### Task 5: Protected workspace and event APIs

**Files:**
- Create: `src/app/api/workspaces/route.ts`
- Create: `src/app/api/workspaces/claim/route.ts`
- Create: `src/app/api/workspaces/invitations/route.ts`
- Create: `src/app/api/workspaces/invitations/accept/route.ts`
- Create: `src/app/api/workspaces/[groupId]/calendar-token/route.ts`
- Create: `src/lib/auth/validation.ts`
- Create: `src/lib/auth/validation.test.ts`
- Modify: `src/app/api/events/route.ts`
- Modify: `src/app/api/events/[id]/route.ts`

**Interfaces:**
- `GET /api/workspaces`: list current user's workspaces.
- `POST /api/workspaces`: create a workspace and owner membership.
- `POST /api/workspaces/claim`: accept `{ token }` for first-owner claim.
- `POST /api/workspaces/invitations`: admin creates an expiring invitation.
- `POST /api/workspaces/invitations/accept`: signed-in user accepts `{ token }`.
- `POST /api/workspaces/:groupId/calendar-token`: owner/admin rotates calendar token.
- Event routes accept `groupId`, not `workspace` access tokens.

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from "vitest";
import { createWorkspaceSchema, invitationSchema } from "./validation";

describe("workspace API validation", () => {
  it("trims a valid workspace name", () => {
    expect(createWorkspaceSchema.parse({ name: "  ИВТ-101  " })).toEqual({ name: "ИВТ-101" });
  });
  it("rejects owner as an invitation role", () => {
    expect(invitationSchema.safeParse({ groupId: "g1", role: "owner" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/lib/auth/validation.test.ts`
Expected: FAIL because validation schemas do not exist.

- [ ] **Step 3: Implement schemas and route handlers**

Use Zod schemas with workspace names of 2–80 characters, token strings of 20–512 characters, invitation roles `admin | member`, and expirations clamped to 1–168 hours. Route handlers call `requireUser` or `requireWorkspaceAccess`, never accept user IDs from request bodies, and return `toErrorResponse(error)` for authorization failures.

Refactor events GET/POST/PATCH/DELETE to read `groupId`, call `requireWorkspaceAccess(groupId, "member")`, and preserve the public demo only when no group is requested. Remove `findGroupByAccessToken` from every event mutation path.

- [ ] **Step 4: Verify protected API compilation and regressions**

Run: `npm test -- src/lib/auth/validation.test.ts src/lib/auth/workspace-guard.test.ts && npm test && npm run build`
Expected: all tests PASS; `rg "findGroupByAccessToken" src/app/api/events` returns no matches.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/workspaces src/app/api/events src/lib/auth/validation.ts src/lib/auth/validation.test.ts
git commit -m "Protect workspace APIs with memberships"
```

### Task 6: Calendar subscription separation

**Files:**
- Modify: `src/app/api/calendar/route.ts`
- Modify: `src/db/repository.ts`
- Modify: `src/lib/calendar.test.ts`

**Interfaces:**
- Calendar route consumes `token`, first checking `calendar_subscription_token`, then read-only legacy `access_token` during compatibility.
- Produces the same `.ics` response and confirmed-event filtering as before.

- [ ] **Step 1: Add a failing calendar credential test**

Add a test asserting that the URL builder uses `token=` and never `workspace=` for a newly issued subscription URL, while the existing calendar rendering assertions remain unchanged.

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- src/lib/calendar.test.ts`
Expected: FAIL because the builder still emits the legacy workspace query.

- [ ] **Step 3: Implement calendar credential lookup**

Add `findGroupByCalendarToken(token)` that checks the new column and a clearly named `findGroupByLegacyCalendarToken(token)` compatibility lookup. The route accepts only GET, adds `private, no-store`, `noindex, nofollow`, and never returns the group token. New UI links use `/api/calendar?token=...`.

- [ ] **Step 4: Verify calendar behavior**

Run: `npm test -- src/lib/calendar.test.ts && npm run build`
Expected: PASS; `/api/calendar` remains in build output.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/calendar/route.ts src/db/repository.ts src/lib/calendar.test.ts
git commit -m "Separate calendar subscription credentials"
```

### Task 7: Authentication, onboarding, and workspace shell UI

**Files:**
- Create: `src/components/auth/auth-shell.tsx`
- Create: `src/components/auth/auth-form.tsx`
- Create: `src/app/auth/sign-in/page.tsx`
- Create: `src/app/auth/sign-up/page.tsx`
- Create: `src/app/auth/forgot-password/page.tsx`
- Create: `src/components/workspace-onboarding.tsx`
- Create: `src/components/workspace-switcher.tsx`
- Create: `src/lib/api-client.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/evidence-desk.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/ui-i18n.ts`
- Modify: `src/lib/ui-i18n.test.ts`

**Interfaces:**
- `WorkspaceSummary = { id; name; role; calendarToken: string | null }`.
- `EvidenceDesk` receives `{ workspaces, activeWorkspaceId, user }` rather than reading a workspace secret from the URL.
- `workspaceFetch(path, init, groupId)` sends credentials and `groupId`, never access tokens.

- [ ] **Step 1: Write failing auth/onboarding translation tests**

Extend `ui-i18n.test.ts` with exact assertions for `Создать аккаунт → Create account`, `Войти → Sign in`, `Создать пространство → Create workspace`, `Подключить Telegram-группу → Connect Telegram group`, and safe round-tripping to Russian.

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/lib/ui-i18n.test.ts`
Expected: FAIL because the new copy is absent.

- [ ] **Step 3: Implement the UI and remove browser secret storage**

Build controlled email/password forms using `authClient.signIn.email`, `authClient.signUp.email`, password recovery APIs exposed by the installed SDK, localized inline errors, disabled submitting state, preserved input on failure, and safe `next` redirects restricted to same-origin paths.

On `/`, read `/api/session` and `/api/workspaces`. Signed-out visitors see the Morrow auth welcome state plus `Try demo`. Signed-in users with zero workspaces see onboarding. Signed-in members see the workspace switcher and `EvidenceDesk`.

Replace `workspaceToken` and `dbp:last-workspace` with `activeWorkspaceId` and `morrow:last-workspace-id`. Update all event calls to use `groupId`. Never store or render legacy access tokens. Display account name/email and sign-out in the header. Keep theme and language controls on auth and application screens.

- [ ] **Step 4: Verify UI behavior**

Run: `npm test -- src/lib/ui-i18n.test.ts && npm run lint && npm run build`
Expected: PASS; `rg "dbp:last-workspace|workspaceToken" src/components src/app` returns no matches.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth src/components/workspace-onboarding.tsx src/components/workspace-switcher.tsx src/lib/api-client.ts src/app/auth src/app/page.tsx src/components/evidence-desk.tsx src/app/globals.css src/lib/ui-i18n.ts src/lib/ui-i18n.test.ts
git commit -m "Add Morrow account and onboarding experience"
```

### Task 8: Invitations, claims, account settings, and role management UI

**Files:**
- Create: `src/app/invite/[token]/page.tsx`
- Create: `src/app/connect/[token]/page.tsx`
- Create: `src/components/workspace-settings.tsx`
- Modify: `src/components/evidence-desk.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/lib/ui-i18n.ts`
- Modify: `src/lib/ui-i18n.test.ts`

**Interfaces:**
- Invitation and claim pages retain only the route token until the user signs in, then post it once.
- Workspace settings consumes membership role and exposes only authorized actions.

- [ ] **Step 1: Add failing localized state tests**

Test exact RU/EN translations for invalid, expired, accepted, and unavailable links; invitation roles; calendar rotation warning; and ownership safety messages.

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/lib/ui-i18n.test.ts`
Expected: FAIL on the first missing invitation-state translation.

- [ ] **Step 3: Implement claim and invitation experiences**

Create focused pages for `/invite/[token]` and `/connect/[token]` with sign-in continuation, one-click acceptance, generic invalid-link errors, and redirect to the joined workspace. Add settings panels for member list, role badges, invitation creation, calendar token rotation, Telegram status, locale, theme, and sign-out. Hide admin actions in UI and enforce the same roles again in routes.

- [ ] **Step 4: Verify all client and server paths**

Run: `npm test && npm run lint && npm run build`
Expected: all commands exit 0 and the two token routes are present in build output.

- [ ] **Step 5: Commit**

```bash
git add src/app/invite src/app/connect src/components/workspace-settings.tsx src/components/evidence-desk.tsx src/app/globals.css src/lib/ui-i18n.ts src/lib/ui-i18n.test.ts
git commit -m "Add workspace invitations and account settings"
```

### Task 9: Migration, browser verification, documentation, and deployment

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/auth-workspace.spec.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `package.json`
- Modify: `vercel.json` only if Auth callback routing requires it after preview verification.

**Interfaces:**
- Produces: repeatable browser smoke coverage and documented environment/migration/runbook.
- Consumes: all prior routes, schema, and UI.

- [ ] **Step 1: Write the browser flow before production deployment**

```ts
import { expect, test } from "@playwright/test";

test("new user creates a workspace and loses access after sign-out", async ({ page }) => {
  await page.goto("/auth/sign-up");
  await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: /Create account|Создать аккаунт/ }).click();
  await page.getByRole("button", { name: /Create workspace|Создать пространство/ }).click();
  await page.getByLabel(/Workspace name|Название пространства/).fill("Morrow E2E");
  await page.getByRole("button", { name: /Create|Создать/ }).click();
  await expect(page.getByText("Morrow E2E")).toBeVisible();
  await page.getByRole("button", { name: /Account|Аккаунт/ }).click();
  await page.getByRole("button", { name: /Sign out|Выйти/ }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});
```

- [ ] **Step 2: Run the test and record the expected pre-deployment failure**

Run: `npx playwright test e2e/auth-workspace.spec.ts`
Expected before local Auth configuration: explicit skip or failure naming missing `E2E_EMAIL`/`E2E_PASSWORD`, never a false PASS.

- [ ] **Step 3: Document and configure the release**

Document local variables, generating `NEON_AUTH_COOKIE_SECRET` with `openssl rand -base64 32`, additive migration commands, Auth trusted origin, preview verification, legacy calendar compatibility, rollback boundaries, and secret rotation. Add Playwright web server configuration using `npm run dev` and prevent credentials from entering traces or screenshots on failure.

Generate a stable cookie secret locally if absent, sync only `NEON_AUTH_COOKIE_SECRET` to Vercel Production/Preview/Development, confirm `NEON_AUTH_BASE_URL` exists for each target, and run `npm run db:migrate` against the intended Neon branch before deploying code that depends on memberships.

- [ ] **Step 4: Run full local and preview verification**

Run: `npm run check`
Expected: lint, all unit tests, and production build PASS.

Deploy a Vercel preview, then verify:

- sign-up/sign-in/sign-out and password recovery;
- first workspace creation and legacy Telegram workspace claim;
- two-workspace switching with no data leakage;
- invitation acceptance and role-restricted settings;
- event create/edit/delete under a session;
- new and legacy read-only calendar feeds;
- Telegram webhook health and cron authorization;
- RU/EN, light/dark, mobile/desktop, keyboard focus, installable PWA.

- [ ] **Step 5: Deploy production and run smoke checks**

Deploy only after preview passes. Confirm `/api/health`, Auth callback, protected event rejection while signed out, authenticated event mutation, Telegram webhook registration, calendar rendering, and Vercel logs without secret leakage. If any auth or membership smoke check fails, roll back the deployment without reverting the additive migration.

- [ ] **Step 6: Commit documentation and verification assets**

```bash
git add playwright.config.ts e2e/auth-workspace.spec.ts README.md docs/architecture.md package.json package-lock.json vercel.json
git commit -m "Document and verify Morrow account rollout"
```

## Completion gate

- `npm run check` passes from a clean checkout.
- The generated migration is additive and applied to the intended database.
- No browser event route accepts `groups.access_token` as authorization.
- No raw credential appears in Git history, build output, browser storage, public payloads, or logs.
- Production registration, sign-in, workspace creation or claim, event mutation, sign-out denial, calendar, Telegram ingestion, and cron authorization are verified.

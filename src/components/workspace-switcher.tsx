"use client";

import { authClient } from "@/lib/auth/client";

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  calendarToken: string | null;
};

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  user,
  onChange,
}: {
  workspaces: WorkspaceSummary[];
  activeId: string;
  user: { email: string; name: string };
  onChange: (id: string) => void;
}) {
  async function signOut() {
    await authClient.signOut();
    window.location.assign("/auth/sign-in");
  }
  return (
    <div className="account-bar">
      <label>
        <span>Пространство</span>
        <select value={activeId} onChange={(event) => onChange(event.target.value)}>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      </label>
      <div><strong>{user.name}</strong><small>{user.email}</small></div>
      <button type="button" onClick={signOut}>Выйти</button>
    </div>
  );
}

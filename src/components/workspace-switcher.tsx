"use client";

import { useState } from "react";
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
  const [settings, setSettings] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [message, setMessage] = useState("");
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];
  const canManage = active.role === "owner" || active.role === "admin";

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/auth/sign-in");
  }

  async function createInvite() {
    setMessage("");
    const response = await fetch("/api/workspaces/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: active.id, role: "member", expiresInHours: 48 }),
    });
    const data = await response.json() as { invitation?: { token?: string }; error?: string };
    if (!response.ok || !data.invitation?.token) { setMessage(data.error || "Не удалось создать приглашение."); return; }
    const url = `${window.location.origin}/invite/${encodeURIComponent(data.invitation.token)}`;
    setInviteUrl(url);
    await navigator.clipboard?.writeText(url);
    setMessage("Ссылка приглашения скопирована.");
  }

  async function rotateCalendar() {
    if (!window.confirm("Старая ссылка календаря перестанет работать. Продолжить?")) return;
    const response = await fetch(`/api/workspaces/${encodeURIComponent(active.id)}/calendar-token`, { method: "POST" });
    if (!response.ok) { setMessage("Не удалось обновить ссылку календаря."); return; }
    window.location.reload();
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
      <button type="button" onClick={() => setSettings(true)} aria-label="Настройки аккаунта">⚙</button>
      <button type="button" onClick={signOut}>Выйти</button>
      {settings && (
        <div className="account-popover">
          <button className="popover-close" onClick={() => setSettings(false)} aria-label="Закрыть">×</button>
          <span className="eyebrow">{active.role}</span>
          <h3>{active.name}</h3>
          <p>Доступ к событиям определяется аккаунтом и ролью, а не секретной ссылкой.</p>
          {canManage && <button onClick={() => void createInvite()}>Создать приглашение</button>}
          {canManage && <button onClick={() => void rotateCalendar()}>Обновить ссылку календаря</button>}
          {inviteUrl && <input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />}
          {message && <small>{message}</small>}
        </div>
      )}
    </div>
  );
}

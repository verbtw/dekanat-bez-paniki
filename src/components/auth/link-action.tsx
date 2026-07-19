"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthShell } from "./auth-shell";

export function LinkAction({ token, mode }: { token: string; mode: "invite" | "claim" }) {
  const [status, setStatus] = useState<"checking" | "sign-in" | "success" | "error">("checking");
  const [workspace, setWorkspace] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const session = await fetch("/api/session", { cache: "no-store" }).then((response) => response.json()) as { user: unknown };
      if (!session.user) {
        sessionStorage.setItem(mode === "claim" ? "morrow:pending-claim" : "morrow:pending-invite", token);
        setStatus("sign-in");
        return;
      }
      const endpoint = mode === "claim" ? "/api/workspaces/claim" : "/api/workspaces/invitations/accept";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) { setStatus("error"); return; }
      const data = await response.json() as { workspace?: { name?: string } };
      setWorkspace(data.workspace?.name ?? "Morrow");
      setStatus("success");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, token]);

  return (
    <AuthShell>
      <span className="eyebrow">secure workspace link</span>
      <h2>{status === "success" ? (mode === "claim" ? "Подключение завершено" : "Приглашение принято") : "Morrow"}</h2>
      {status === "checking" && <p>Проверяем ссылку…</p>}
      {status === "sign-in" && <><p>Войдите в аккаунт, чтобы безопасно продолжить.</p><Link className="auth-submit link-button" href="/auth/sign-in">Войти</Link></>}
      {status === "success" && <><p>{workspace} теперь доступно в вашем аккаунте.</p><Link className="auth-submit link-button" href="/">Открыть пространство</Link></>}
      {status === "error" && <><p className="form-message error">Ссылка недействительна или уже недоступна.</p><Link className="auth-secondary" href="/">Вернуться в Morrow</Link></>}
    </AuthShell>
  );
}

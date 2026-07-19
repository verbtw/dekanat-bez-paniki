"use client";

import { useEffect, useState } from "react";
import { EvidenceDesk } from "./evidence-desk";
import { WorkspaceOnboarding } from "./workspace-onboarding";
import { WorkspaceSwitcher, type WorkspaceSummary } from "./workspace-switcher";

type User = { id: string; email: string; name: string };

export function MorrowApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeId, setActiveId] = useState("");
  const [demo, setDemo] = useState(false);

  async function load() {
    const sessionResponse = await fetch("/api/session", { cache: "no-store" });
    const session = await sessionResponse.json() as { user: User | null };
    setUser(session.user);
    if (!session.user) return;
    const response = await fetch("/api/workspaces", { cache: "no-store" });
    const data = await response.json() as { workspaces?: WorkspaceSummary[] };
    const next = data.workspaces ?? [];
    setWorkspaces(next);
    const saved = localStorage.getItem("morrow:last-workspace-id");
    setActiveId(next.some((workspace) => workspace.id === saved) ? saved! : next[0]?.id ?? "");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function selectWorkspace(id: string) {
    setActiveId(id);
    localStorage.setItem("morrow:last-workspace-id", id);
  }

  if (user === undefined) return <main className="app-loading"><span>morrow</span><i /></main>;
  if (!user && !demo) {
    return (
      <main className="welcome-page">
        <nav><strong>morrow</strong><div><a href="/auth/sign-in">Войти</a><a className="welcome-cta" href="/auth/sign-up">Создать аккаунт</a></div></nav>
        <section>
          <span className="eyebrow">quietly in sync</span>
          <h1>Tomorrow,<br /><em>without the noise.</em></h1>
          <p>Учебные сообщения становятся проверенными событиями. Ничего не теряется, каждое решение остаётся объяснимым.</p>
          <div><a className="welcome-primary" href="/auth/sign-up">Начать бесплатно</a><button onClick={() => setDemo(true)}>Продолжить с демо</button></div>
        </section>
        <aside><span>01</span><strong>Collect</strong><p>Telegram и ручной ввод</p><span>02</span><strong>Verify</strong><p>Конфликты и источники</p><span>03</span><strong>Move</strong><p>Календарь и сводка</p></aside>
      </main>
    );
  }
  if (!user) return <EvidenceDesk />;
  if (workspaces.length === 0) return <WorkspaceOnboarding onCreated={load} />;
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];
  return (
    <>
      <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} user={user} onChange={selectWorkspace} />
      <EvidenceDesk
        key={active.id}
        workspaceId={active.id}
        initialWorkspaceName={active.name}
        calendarToken={active.calendarToken}
      />
    </>
  );
}

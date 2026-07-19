import type { ReactNode } from "react";
import Link from "next/link";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Morrow">
        <Link className="auth-brand" href="/">morrow<span>quietly in sync</span></Link>
        <div>
          <span className="eyebrow">keep tomorrow clear</span>
          <h1>Меньше шума.<br />Больше ясности.</h1>
          <p>Сообщения из учебных чатов превращаются в проверенный план, где источник каждого изменения остаётся видимым.</p>
        </div>
        <small>Telegram → evidence → calendar</small>
      </section>
      <section className="auth-card">{children}</section>
    </main>
  );
}

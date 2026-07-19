"use client";

import { FormEvent, useState } from "react";

export function WorkspaceOnboarding({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null;
      setError(data?.error || "Не удалось создать пространство.");
      setPending(false);
      return;
    }
    await onCreated();
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <span className="eyebrow">first quiet step</span>
        <h1>Создайте своё пространство</h1>
        <p>Это может быть группа, курс или личный учебный поток. Telegram можно подключить позже.</p>
        <form onSubmit={submit}>
          <label>Название пространства<input aria-label="Название пространства" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, ИВТ-101" /></label>
          {error && <p className="form-message error">{error}</p>}
          <button className="auth-submit" disabled={pending}>{pending ? "Создаю…" : "Создать пространство"}</button>
        </form>
        <p className="onboarding-note">Уже есть Telegram-ссылка? После входа её можно подключить в настройках.</p>
      </section>
    </main>
  );
}

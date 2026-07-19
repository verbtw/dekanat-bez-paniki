"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { AuthShell } from "./auth-shell";

type Mode = "sign-in" | "sign-up" | "forgot-password";

const copy = {
  ru: {
    "sign-in": ["С возвращением", "Войти", "Нет аккаунта?", "Создать аккаунт"],
    "sign-up": ["Начни спокойно", "Создать аккаунт", "Уже есть аккаунт?", "Войти"],
    "forgot-password": ["Восстановление", "Отправить письмо", "Вспомнили пароль?", "Войти"],
  },
  en: {
    "sign-in": ["Welcome back", "Sign in", "No account?", "Create account"],
    "sign-up": ["Start quietly", "Create account", "Already have an account?", "Sign in"],
    "forgot-password": ["Recovery", "Send email", "Remembered it?", "Sign in"],
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const [locale, setLocale] = useState<"ru" | "en">(() =>
    typeof window !== "undefined" && localStorage.getItem("morrow:locale") === "en" ? "en" : "ru",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const text = copy[locale][mode];

  function switchLocale(next: "ru" | "en") {
    setLocale(next);
    localStorage.setItem("morrow:locale", next);
    document.documentElement.lang = next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({ email, password, name, callbackURL: "/" });
        if (result.error) throw new Error(result.error.message);
        window.location.assign("/");
      } else if (mode === "sign-in") {
        const result = await authClient.signIn.email({ email, password, callbackURL: "/" });
        if (result.error) throw new Error(result.error.message);
        window.location.assign("/");
      } else {
        const result = await authClient.requestPasswordReset({ email, redirectTo: "/auth/sign-in" });
        if (result.error) throw new Error(result.error.message);
        setNotice(locale === "ru" ? "Проверьте почту — ссылка уже отправлена." : "Check your email — the link is on its way.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : locale === "ru" ? "Не удалось продолжить." : "Could not continue.");
    } finally {
      setPending(false);
    }
  }

  const alternateHref = mode === "sign-up" ? "/auth/sign-in" : "/auth/sign-up";
  return (
    <AuthShell>
      <div className="auth-card-tools">
        <button className={locale === "ru" ? "active" : ""} onClick={() => switchLocale("ru")}>RU</button>
        <button className={locale === "en" ? "active" : ""} onClick={() => switchLocale("en")}>EN</button>
      </div>
      <span className="eyebrow">morrow account</span>
      <h2>{text[0]}</h2>
      <p>{locale === "ru" ? "Ваши пространства, события и источники будут доступны после входа." : "Your workspaces, events, and sources stay available after sign-in."}</p>
      <form className="auth-form" onSubmit={submit}>
        {mode === "sign-up" && <label>{locale === "ru" ? "Имя" : "Name"}<input autoComplete="name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>}
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        {mode !== "forgot-password" && <label>{locale === "ru" ? "Пароль" : "Password"}<input type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
        {error && <p className="form-message error" role="alert">{error}</p>}
        {notice && <p className="form-message success" role="status">{notice}</p>}
        <button className="auth-submit" disabled={pending}>{pending ? "…" : text[1]}</button>
      </form>
      {mode === "sign-in" && <a className="auth-secondary" href="/auth/forgot-password">{locale === "ru" ? "Забыли пароль?" : "Forgot password?"}</a>}
      <p className="auth-alternate">{text[2]} <a href={alternateHref}>{text[3]}</a></p>
    </AuthShell>
  );
}

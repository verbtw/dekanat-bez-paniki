"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios] = useState(() => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [visible, setVisible] = useState(false);
  const [instructions, setInstructions] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone || window.localStorage.getItem("dbp:pwa-dismissed") === "1") return;

    const frame = window.requestAnimationFrame(() => setVisible(true));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.cancelAnimationFrame(frame);
    };
  }, [ios]);

  if (!visible) return null;

  async function install() {
    if (!prompt) {
      setInstructions(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setPrompt(null);
  }

  function dismiss() {
    window.localStorage.setItem("dbp:pwa-dismissed", "1");
    setVisible(false);
  }

  return (
    <aside className="install-card" aria-label="Установить приложение">
      <span className="install-icon">Д</span>
      <div>
        <strong>Установить Morrow</strong>
        <small>{instructions
          ? ios
            ? "В Safari нажми «Поделиться», затем «На экран Домой»."
            : "Открой меню браузера и выбери «Установить приложение»."
          : "Отдельное окно, иконка и быстрый запуск с рабочего стола."}</small>
      </div>
      <button className="install-primary" type="button" onClick={() => void install()}>{instructions ? "Понятно" : "Установить"}</button>
      <button className="install-close" type="button" onClick={dismiss} aria-label="Скрыть предложение установки">×</button>
    </aside>
  );
}

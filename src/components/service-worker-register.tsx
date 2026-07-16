"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      );
      if ("caches" in window) {
        void window.caches.keys().then((keys) => Promise.all(
          keys
            .filter((key) => key.startsWith("morrow-shell") || key.startsWith("dbp-shell"))
            .map((key) => window.caches.delete(key)),
        ));
      }
      return;
    }
    let interval = 0;
    const resetReloadGuard = window.setTimeout(
      () => window.sessionStorage.removeItem("dbp:sw-reloaded"),
      5_000,
    );
    const onControllerChange = () => {
      if (window.sessionStorage.getItem("dbp:sw-reloaded") === "1") return;
      window.sessionStorage.setItem("dbp:sw-reloaded", "1");
      window.location.reload();
    };
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        interval = window.setInterval(() => void registration.update(), 60 * 60 * 1_000);
      } catch {
        return;
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.clearTimeout(resetReloadGuard);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  return null;
}

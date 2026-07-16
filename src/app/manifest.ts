import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Деканат без паники",
    short_name: "Деканат",
    description: "Проверяемые события из учебных чатов без потерянных переносов и конфликтующих сообщений.",
    id: "/",
    start_url: "/?source=installed-app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8f9fc",
    theme_color: "#4054d6",
    categories: ["education", "productivity", "utilities"],
    lang: "ru",
    launch_handler: { client_mode: "focus-existing" },
    share_target: {
      action: "/?share=1",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Входящие", short_name: "Входящие", url: "/?view=inbox", icons: [{ src: "/app-icon-192.png", sizes: "192x192" }] },
      { name: "Радар конфликтов", short_name: "Радар", url: "/?view=radar", icons: [{ src: "/app-icon-192.png", sizes: "192x192" }] },
    ],
  };
}

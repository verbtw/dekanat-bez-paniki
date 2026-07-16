import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const appUrl = process.env.APP_URL?.trim()?.replace(/\/$/, "");

if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing in .env.local");
if (!appUrl?.startsWith("https://")) throw new Error("APP_URL must be a public HTTPS address");

let secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
if (!secret) {
  secret = randomBytes(24).toString("base64url");
  const envPath = ".env.local";
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const secretLine = `TELEGRAM_WEBHOOK_SECRET=${secret}`;
  const updated = /^TELEGRAM_WEBHOOK_SECRET=.*$/m.test(existing)
    ? existing.replace(/^TELEGRAM_WEBHOOK_SECRET=.*$/m, secretLine)
    : `${existing}${existing.length > 0 && !existing.endsWith("\n") ? "\n" : ""}${secretLine}\n`;
  writeFileSync(envPath, updated);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${appUrl}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});

const result = await response.json();
if (!response.ok || !result.ok) throw new Error(result.description || "Telegram rejected webhook");

const commandsResponse = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    commands: [
      { command: "start", description: "Как пользоваться ботом" },
      { command: "events", description: "Последние события этого чата" },
      { command: "today", description: "События на сегодня" },
      { command: "week", description: "План на ближайшие 7 дней" },
      { command: "digest", description: "Короткая сводка группы" },
      { command: "conflicts", description: "Активные противоречия" },
      { command: "trusted", description: "Доверенные преподаватели" },
      { command: "trust", description: "Назначить преподавателя (админ)" },
      { command: "untrust", description: "Снять роль преподавателя (админ)" },
      { command: "status", description: "Состояние бота и базы" },
      { command: "help", description: "Показать подсказку" },
    ],
  }),
});
const commandsResult = await commandsResponse.json();
if (!commandsResponse.ok || !commandsResult.ok) {
  throw new Error(commandsResult.description || "Telegram rejected bot commands");
}

console.log(`Webhook and commands configured: ${appUrl}/api/telegram/webhook`);

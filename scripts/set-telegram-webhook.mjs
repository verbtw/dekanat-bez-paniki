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
    allowed_updates: ["message"],
    drop_pending_updates: true,
  }),
});

const result = await response.json();
if (!response.ok || !result.ok) throw new Error(result.description || "Telegram rejected webhook");

console.log(`Webhook configured: ${appUrl}/api/telegram/webhook`);

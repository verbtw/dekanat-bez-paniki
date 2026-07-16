import { spawnSync } from "node:child_process";

const secret = process.env.CRON_SECRET?.trim()
  || process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
if (!secret) throw new Error("CRON_SECRET or TELEGRAM_WEBHOOK_SECRET is required");

const result = spawnSync(
  "vercel",
  ["env", "add", "CRON_SECRET", "production", "--force", "--sensitive", "--yes"],
  { input: `${secret}\n`, encoding: "utf8" },
);
if (result.status !== 0) {
  throw new Error(result.stderr.trim() || "Failed to sync CRON_SECRET");
}
console.log("Protected CRON_SECRET synced to Vercel production.");

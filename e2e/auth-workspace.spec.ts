import { expect, test } from "@playwright/test";

test("signed-out visitor can reach account flows and local demo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Создать аккаунт" })).toBeVisible();
  await page.getByRole("button", { name: "Продолжить с демо" }).click();
  await expect(page.getByRole("heading", { name: "Входящие" })).toBeVisible();
});

test("an unconfigured auth provider fails safely", async ({ request }) => {
  test.skip(Boolean(process.env.NEON_AUTH_BASE_URL), "Only applies without Auth config");
  const response = await request.get("/api/auth/get-session");
  expect(response.status()).toBe(503);
  await expect(response.json()).resolves.toEqual({
    error: "Authentication service is not configured",
  });
});

test("new account creates a workspace and signs out", async ({ page }) => {
  const emailTemplate = process.env.E2E_EMAIL_TEMPLATE;
  test.skip(
    !emailTemplate?.includes("{timestamp}") || !process.env.E2E_PASSWORD,
    "E2E_EMAIL_TEMPLATE with {timestamp} and E2E_PASSWORD are required",
  );
  const marker = String(Date.now());
  const email = emailTemplate!.replace("{timestamp}", marker);
  const workspaceName = `Morrow E2E ${marker}`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Имя").fill("Morrow E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await page.getByLabel("Название пространства").fill(workspaceName);
  await page.getByRole("button", { name: "Создать пространство" }).click();
  await expect(page.getByRole("heading", { name: "Входящие" })).toBeVisible();
  const ownerWorkspace = await page.evaluate(async (name) => {
    const response = await fetch("/api/workspaces");
    if (!response.ok) return null;
    const data = await response.json() as { workspaces?: Array<{ name: string; role: string }> };
    return data.workspaces?.find((workspace) => workspace.name === name) ?? null;
  }, workspaceName);
  expect(ownerWorkspace?.role).toBe("owner");
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

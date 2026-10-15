import { expect, test } from "@playwright/test";
import { createCharacter, registerAndLogin, uniqueEmail } from "./helpers";

test.describe("auth and ownership", () => {
  test("logged-out users are sent to login and API calls get 401", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    for (const path of ["/api/age", "/api/choice", "/api/characters"]) {
      const res = await page.request.post(path, { data: {} });
      expect(res.status(), path).toBe(401);
    }
  });

  test("sign out, then a wrong password shows an error", async ({ page }) => {
    const email = uniqueEmail("badpw");
    await registerAndLogin(page, email);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible();
  });

  test("duplicate registration is rejected regardless of email case", async ({ page }) => {
    const email = uniqueEmail("dupe");
    await registerAndLogin(page, email);
    const res = await page.request.post("/api/auth/register", {
      data: { email: email.toUpperCase(), password: "another-pass-1" },
    });
    expect(res.status()).toBe(409);
  });

  test("another user cannot age my character", async ({ page, browser }) => {
    await registerAndLogin(page, uniqueEmail("owner"));
    const id = await createCharacter(page);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await registerAndLogin(otherPage, uniqueEmail("intruder"));
    const res = await otherPage.request.post("/api/age", { data: { characterId: id } });
    expect(res.status()).toBe(403);
    await other.close();
  });
});

import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, registerAndLogin, uniqueEmail } from "./helpers";

test("DLC store lists packs and marks the fantasy pack as coming soon", async ({ page }) => {
  await registerAndLogin(page, uniqueEmail("store"));
  await page.getByRole("link", { name: "DLC Packs" }).click();
  await expect(page).toHaveURL(/\/store$/);
  await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // A coming-soon pack cannot be used to start a life.
  const res = await page.request.post("/api/characters", {
    data: {
      firstName: "Elf", lastName: "Test", birthCountry: "Australia", birthCity: "Perth",
      gender: "female", sexuality: "heterosexual", packId: "fantasy_pack",
    },
  });
  expect(res.status()).toBe(400);
});

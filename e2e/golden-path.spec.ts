import { expect, test } from "@playwright/test";
import {
  ageButton, ageOnce, createCharacter, eventModal, expectNoHorizontalScroll,
  playTurn, registerAndLogin, uniqueEmail, withDb,
} from "./helpers";

test.describe("golden path", () => {
  test("register, create a life and play 20 years", async ({ page }) => {
    await registerAndLogin(page, uniqueEmail("golden"));
    await expectNoHorizontalScroll(page);

    await createCharacter(page);
    await expectNoHorizontalScroll(page);
    await expect(page.getByText("You were born in Sydney, Australia.")).toBeVisible();

    let lastAge = 0;
    for (let year = 1; year <= 20; year++) {
      const body = await playTurn(page);
      // Hidden stats must never reach the client.
      expect(body).not.toHaveProperty("hiddenStats");
      expect(body.character).not.toHaveProperty("hiddenStats");
      lastAge = body.character.age;
      expect(lastAge).toBe(year);
      if (!body.character.isAlive) break;
      await expect(page.getByText(new RegExp(`^Age ${year} · Sydney`))).toBeVisible();
    }
    test.skip(lastAge < 20, "character died young; rest of the path not reachable this run");

    await expect(page.getByText("─── Age 20 ───")).toBeVisible();
    await expectNoHorizontalScroll(page);

    // At 18 the career engine finishes school.
    await expect(page.getByText(/📚 highschool/)).toBeVisible();

    // The other tabs render without crashing or overflowing.
    for (const tab of ["Career", "Relations", "Assets", "Life"]) {
      await page.getByRole("button", { name: tab }).click();
      await expectNoHorizontalScroll(page);
    }

    // The character shows up on the home list.
    await page.getByRole("link", { name: "← Lives" }).click();
    await expect(page.getByText("Ada Tester")).toBeVisible();
    await expect(page.getByText(/Age 20 · Sydney/)).toBeVisible();
  });

  test("a pending event survives a reload and blocks Age Up", async ({ page }) => {
    await registerAndLogin(page, uniqueEmail("pending"));
    const id = await createCharacter(page);

    // The fallback chain guarantees an event on any turn the character survives.
    const body = await ageOnce(page);
    expect(body.event).toBeTruthy();
    await expect(eventModal(page)).toBeVisible();
    const eventText = await eventModal(page).locator("p").first().innerText();

    await page.reload();
    await expect(eventModal(page)).toBeVisible();
    await expect(eventModal(page)).toContainText(eventText);
    await expect(ageButton(page)).toBeDisabled();

    // The server refuses to age past an unresolved event.
    const res = await page.request.post("/api/age", { data: { characterId: id } });
    expect(res.status()).toBe(409);
  });

  test("a very old character dies and gets a tombstone", async ({ page }) => {
    await registerAndLogin(page, uniqueEmail("death"));
    const id = await createCharacter(page, "Old", "Timer");

    await withDb(db => db.collection<{ _id: string }>("characters").updateOne(
      { _id: id },
      { $set: { age: 130, "stats.health": 1, updatedAt: new Date().toISOString() } },
    ));
    await page.reload();

    const body = await ageOnce(page);
    expect(body.character.isAlive).toBe(false);
    expect(body.event).toBeNull();

    await expect(page.getByText("🪦")).toBeVisible();
    await expect(page.getByText(/Lived to age 13\d/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a New Life" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("Deceased")).toBeVisible();
  });
});

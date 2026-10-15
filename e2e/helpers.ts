import { expect, type Page } from "@playwright/test";
import { MongoClient, type Db } from "mongodb";
import { E2E_MONGO_URI } from "./env";

export const PASSWORD = "e2e-password-123";

export function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

export async function registerAndLogin(page: Page, email: string) {
  await page.goto("/register");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password (min 8 chars)").fill(PASSWORD);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Your Lives" })).toBeVisible();
}

/** Creates a character through the New Life form and returns its id. */
export async function createCharacter(page: Page, firstName = "Ada", lastName = "Tester"): Promise<string> {
  await page.getByRole("link", { name: "+ Start a New Life" }).click();
  await expect(page.getByRole("heading", { name: "New Life" })).toBeVisible();
  await page.getByPlaceholder("First Name").fill(firstName);
  await page.getByPlaceholder("Last Name").fill(lastName);
  await page.getByPlaceholder("Birth City").fill("Sydney");
  await page.getByRole("button", { name: "Begin Life" }).click();
  await expect(page).toHaveURL(/\/game\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^Age 0 · Sydney/)).toBeVisible();
  return page.url().split("/game/")[1];
}

export const ageButton = (page: Page) => page.getByRole("button", { name: "AGE UP" });
export const eventModal = (page: Page) => page.getByTestId("event-modal");

const isAgeResponse = (url: string, method: string) => url.endsWith("/api/age") && method === "POST";

/** One turn: Age Up, then pick the first choice if an event appears. */
export async function playTurn(page: Page) {
  const ageResponse = page.waitForResponse(r => isAgeResponse(r.url(), r.request().method()));
  await ageButton(page).click();
  const res = await ageResponse;
  expect(res.status()).toBe(200);
  const body = await res.json();
  if (body.event) {
    await expect(eventModal(page)).toBeVisible();
    const choiceResponse = page.waitForResponse(r => r.url().endsWith("/api/choice"));
    await eventModal(page).getByRole("button").first().click();
    expect((await choiceResponse).status()).toBe(200);
    await expect(eventModal(page)).toBeHidden();
  }
  return body;
}

/** Clicks Age Up once and returns the parsed /api/age response body. */
export async function ageOnce(page: Page) {
  const res = page.waitForResponse(r => isAgeResponse(r.url(), r.request().method()));
  await ageButton(page).click();
  return (await res).json();
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = new MongoClient(E2E_MONGO_URI);
  await client.connect();
  try {
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

import { expect, test, type Page } from "@playwright/test";

const API_KEY = process.env.POLLINATIONS_API_KEY ?? "";
const APP = process.env.E2E_BASE_URL || "http://127.0.0.1:4173/wanderpost/";
const evidence = (name: string) => `evidence/${name}.png`;

/** Two real postcards, so a shared link costs a vision call and no painting. */
const ARCHWAY = "https://media.pollinations.ai/e7fd7098d98f7fbf51a43a1ae58a709d626105a33f27f37bf016776991bfbbc9";
const BRIDGE = "https://media.pollinations.ai/cd03f34b15ed48d8dc0610ea1828ab7cdd8a07d9f52253f78abcf04fce4e71b3";

/** The same packing `encodeTrail` does in the app. */
const trailLink = (stops: { label: string; url: string }[]): string =>
    Buffer.from(JSON.stringify(stops)).toString("base64url");

const shot = (page: Page, name: string) =>
    page.screenshot({ path: evidence(name), fullPage: true });

const heading = (page: Page, text: string | RegExp) =>
    page.getByRole("heading", { name: text });

const signIn = async (page: Page) => {
    await page.goto(APP);
    await page.evaluate(
        ([key]) => sessionStorage.setItem("wanderpost.token", key),
        [API_KEY],
    );
    await page.reload();
    await expect(page.getByText("Signed in — the walk runs on your Pollen.")).toBeVisible();
};

test.beforeEach(() => {
    expect(API_KEY, "set POLLINATIONS_API_KEY to run the live end-to-end test").not.toBe("");
});

test("walks into a picture, steps through a way forward, then shares the trail", async ({ page }) => {
    await signIn(page);
    await shot(page, "01-start");

    await page.locator("#scene").fill("a flooded subway station under a neon city");
    await page.locator(".style", { hasText: "Watercolour postcard" }).click();
    await page.getByRole("button", { name: "Begin the walk" }).click();

    // The first postcard is painted, then read for ways out.
    await expect(page.locator(".view img")).toBeVisible({ timeout: 240_000 });
    await expect(page.locator(".spot").first()).toBeVisible({ timeout: 120_000 });
    const ways = await page.locator(".spot").count();
    expect(ways).toBeGreaterThanOrEqual(2);
    expect(ways).toBeLessThanOrEqual(3);
    await expect(page.locator(".trail .crumb")).toHaveCount(1);
    await shot(page, "02-first-view");

    // Step through one of them: a second view, painted from the first.
    const destination = await page.locator(".spot").first().getAttribute("aria-label");
    expect(destination).toMatch(/^Go /);
    await page.locator(".spot").first().click();
    await expect(page.locator(".view img")).toHaveCount(1, { timeout: 240_000 });
    await expect(page.locator(".trail .crumb")).toHaveCount(2, { timeout: 240_000 });
    await expect(page.locator(".head .sub")).toContainText("View 2 of ");
    await expect(page.locator(".spot").first()).toBeVisible({ timeout: 120_000 });
    await shot(page, "03-second-view");

    // The breadcrumb is a map of everywhere been, and it goes back.
    await page.locator(".trail .crumb").first().click();
    await expect(page.locator(".head .sub")).toContainText("View 1 of ", { timeout: 120_000 });
    await expect(page.locator(".trail .crumb")).toHaveCount(1);

    // Going back keeps the steps already taken out of the walk.
    await page.locator(".trail .crumb").first().click();

    // A trail carries as a link.
    await page.getByRole("button", { name: "Share this trail" }).click();
    const link = await page.locator("#trail-link").inputValue();
    expect(link).toContain("#t=");
    expect(link.startsWith(APP)).toBe(true);
    await shot(page, "04-share-link");

    await expect(page.locator("#error")).toHaveCount(0);
});

test("opens a trail someone else shared", async ({ page }) => {
    await signIn(page);
    const link = trailLink([
        { label: "a moss-covered stone archway", url: ARCHWAY },
        { label: "the lantern-lit footbridge", url: BRIDGE },
    ]);
    // Changing only the hash is a same-document navigation, so reload to make
    // the app read it.
    await page.goto(`${APP}#t=${link}`);
    await page.reload();

    await expect(heading(page, "the lantern-lit footbridge")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".view img")).toHaveAttribute("src", BRIDGE);
    await expect(page.locator(".trail .crumb")).toHaveCount(2);
    // The walk continues from where the shared trail stops.
    await expect(page.locator(".spot").first()).toBeVisible({ timeout: 120_000 });
    await shot(page, "05-shared-trail");

    await expect(page.locator("#error")).toHaveCount(0);
});

test("starts a fresh walk from a link that is not a trail", async ({ page }) => {
    await signIn(page);
    await page.goto(`${APP}#t=not-a-trail`);
    await page.reload();
    await expect(heading(page, "Walk into a picture.")).toBeVisible();
    await expect(page.locator("#scene")).toBeVisible();
    await expect(page.locator("#error")).toHaveCount(0);
});

test("asks for Pollen instead of walking for free", async ({ page }) => {
    await page.goto(APP);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.locator("#scene").fill("a quiet lane");
    await page.getByRole("button", { name: "Begin the walk" }).click();
    await expect(page.locator("#error")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("#error")).toContainText("Sign in with your Pollen");
    await expect(page.getByRole("button", { name: "Sign in with your Pollen" })).toBeVisible();
    await shot(page, "06-signin-required");
});

test("sign-in hands off to the Pollinations consent screen", async ({ page }) => {
    test.skip(
        !process.env.E2E_BASE_URL,
        "the local preview port is not a registered redirect URI",
    );
    await page.goto(APP);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    await page.getByRole("button", { name: "Sign in with your Pollen" }).click();
    await page.waitForURL(/enter\.pollinations\.ai\/authorize/, { timeout: 60_000 });

    const url = new URL(page.url());
    expect(url.searchParams.get("client_id")).toMatch(/^pk_/);
    expect(url.searchParams.get("redirect_uri")).toBe(APP);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();

    // The consent screen must name the app, not fall back to the hostname.
    await expect(page.getByText("Wanderpost", { exact: true })).toBeVisible({
        timeout: 60_000,
    });
    await shot(page, "07-consent");
});

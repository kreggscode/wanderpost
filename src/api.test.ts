import { beforeAll, describe, expect, it } from "vitest";
import { ApiError, askVision, generateImage } from "./api.js";
import { parseSpots, SPOTS_SYSTEM } from "./world.js";

const KEY = process.env.POLLINATIONS_API_KEY ?? "";

// `auth.ts` reads sessionStorage when a call is made; Node has none.
const store = new Map<string, string>();
(globalThis as unknown as Record<string, unknown>).sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
};

beforeAll(() => {
    if (KEY) store.set("wanderpost.token", KEY);
});

describe.skipIf(!KEY)("the walk, against the live endpoint", () => {
    let first = "";

    it("paints a first view", async () => {
        first = await generateImage("a moss-covered stone archway in a pine forest, watercolour postcard");
        expect(first).toMatch(/^https:\/\/media\.pollinations\.ai\//);
    }, 180_000);

    it("reads the ways forward out of it", async () => {
        expect(first).not.toBe("");
        const reply = await askVision(SPOTS_SYSTEM, "Find the ways forward.", first);
        const spots = parseSpots(reply);
        expect(spots).not.toBeNull();
        expect(spots!.length).toBeGreaterThanOrEqual(2);
        for (const spot of spots!) {
            expect(spot.x).toBeGreaterThanOrEqual(0);
            expect(spot.x).toBeLessThanOrEqual(1);
            expect(spot.y).toBeGreaterThanOrEqual(0);
            expect(spot.y).toBeLessThanOrEqual(1);
            expect(spot.prompt.length).toBeGreaterThan(0);
        }
    }, 180_000);

    it("paints the next view from the one before it", async () => {
        const second = await generateImage(
            "a lantern-lit wooden footbridge over a stream, watercolour postcard",
            first,
        );
        expect(second).toMatch(/^https:\/\/media\.pollinations\.ai\//);
        expect(second).not.toBe(first);
    }, 180_000);
});

describe("sign-in is required", () => {
    it("raises an ApiError before any request goes out", async () => {
        const previous = store.get("wanderpost.token");
        store.delete("wanderpost.token");
        const error = await generateImage("nowhere").catch((caught: unknown) => caught);
        store.set("wanderpost.token", previous ?? "");
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(401);
    });
});

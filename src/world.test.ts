import { describe, expect, it } from "vitest";
import { MAX_PROMPT_CHARS, MAX_SPOTS, MAX_STOPS } from "./config.js";
import {
    decodeTrail,
    encodeTrail,
    extractJson,
    parseSpots,
    scenePrompt,
    spotPrompt,
    type Trail,
} from "./world.js";

const ways = `{"spots":[
    {"label":"stone arch trail","x":0.5,"y":0.72,"prompt":"a narrow forest path continues ahead"},
    {"label":"right broken wall","x":0.8,"y":0.62,"prompt":"a gap between stones reveals a side path"},
    {"label":"left cairn opening","x":0.2,"y":0.64,"prompt":"a fallen cairn opens into the undergrowth"}
]}`;

describe("extractJson", () => {
    it("reads a bare object", () => {
        expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    });

    it("reads a reply fenced as json", () => {
        expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    });

    it("reads a reply buried in prose", () => {
        expect(extractJson("Sure! Here you go: {\"a\":1} — hope that helps.")).toEqual({
            a: 1,
        });
    });

    it("reads an array", () => {
        expect(extractJson("result: [1,2]")).toEqual([1, 2]);
    });

    it("throws when there is nothing to read", () => {
        expect(() => extractJson("I could not work it out.")).toThrow();
    });

    it("throws on truncated json", () => {
        expect(() => extractJson('{"spots":[{"label":"a"')).toThrow();
    });
});

describe("parseSpots", () => {
    it("turns a vision reply into markers", () => {
        const spots = parseSpots(ways);
        expect(spots).not.toBeNull();
        expect(spots).toHaveLength(3);
        expect(spots?.[0]).toMatchObject({ label: "stone arch trail", x: 0.5, y: 0.72 });
    });

    it("reads a fenced reply", () => {
        expect(parseSpots(`\`\`\`json\n${ways}\n\`\`\``)).toHaveLength(3);
    });

    it("reads a spots wrapper or a bare array", () => {
        const bare =
            '[{"label":"a door","x":0.4,"y":0.5,"prompt":"a lit corridor"},' +
            '{"label":"a gate","x":0.6,"y":0.5,"prompt":"a walled garden"}]';
        expect(parseSpots(bare)).toHaveLength(2);
        expect(parseSpots(ways)).toHaveLength(3);
    });

    it("refuses a reply with fewer ways out than the game promises", () => {
        const one = '{"spots":[{"label":"a door","x":0.4,"y":0.5,"prompt":"a corridor"}]}';
        expect(parseSpots(one)).toBeNull();
    });

    it("refuses a reply that is not a list of ways", () => {
        expect(parseSpots("There are three doors but I will not say where.")).toBeNull();
        expect(parseSpots('{"doors":[]}')).toBeNull();
        expect(parseSpots("[]")).toBeNull();
    });

    it("clamps coordinates back onto the picture", () => {
        const stray = `{"spots":[
            {"label":"far right","x":1.8,"y":-0.4,"prompt":"a hedge"},
            {"label":"far left","x":-1,"y":3,"prompt":"a gate"}]}`;
        const spots = parseSpots(stray);
        expect(spots?.[0]).toMatchObject({ x: 1, y: 0 });
        expect(spots?.[1]).toMatchObject({ x: 0, y: 1 });
    });

    it("drops entries missing the things a marker needs", () => {
        const mixed = `{"spots":[
            {"label":"","x":0.1,"y":0.1,"prompt":"a hole"},
            {"label":"no coords","prompt":"a hole"},
            {"label":"no prompt","x":0.1,"y":0.1},
            {"label":"good one","x":0.3,"y":0.3,"prompt":"a lit corridor"},
            {"label":"also good","x":0.7,"y":0.4,"prompt":"a walled garden"}]}`;
        const spots = parseSpots(mixed);
        expect(spots).toHaveLength(2);
        expect(spots?.map((spot) => spot.label)).toEqual(["good one", "also good"]);
    });

    it("refuses a reply where nothing usable survived", () => {
        const allBad = `{"spots":[
            {"label":"","x":0.1,"y":0.1,"prompt":"a hole"},
            {"label":"no coords","prompt":"a hole"}]}`;
        expect(parseSpots(allBad)).toBeNull();
    });

    it("keeps at most the promised number of ways", () => {
        const many = {
            spots: Array.from({ length: 8 }, (_, index) => ({
                label: `way ${index}`,
                x: index / 8,
                y: 0.5,
                prompt: "somewhere",
            })),
        };
        expect(parseSpots(JSON.stringify(many))).toHaveLength(MAX_SPOTS);
    });
});

describe("prompts", () => {
    it("paints the first view from the scene and the chosen style", () => {
        expect(scenePrompt("a flooded subway station", "watercolour postcard")).toBe(
            "a flooded subway station, watercolour postcard",
        );
    });

    it("paints later views from the way through, from a new angle", () => {
        const spot = { label: "a door", x: 0.5, y: 0.5, prompt: "a lantern-lit corridor" };
        const prompt = spotPrompt(spot, "ink and wash");
        expect(prompt).toContain("new camera position and angle");
        expect(prompt).toContain("a lantern-lit corridor, ink and wash");
    });

    it("keeps a long scene from running away with the prompt", () => {
        const long = "a very long scene ".repeat(200);
        expect(scenePrompt(long, "risograph").length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
        expect(spotPrompt({ label: "x", x: 0, y: 0, prompt: long }, "risograph").length).toBeLessThanOrEqual(
            MAX_PROMPT_CHARS,
        );
    });
});

describe("trail links", () => {
    const trail: Trail = [
        { label: "a flooded subway station", url: "https://media.pollinations.ai/one" },
        { label: "the ticket hall", url: "https://media.pollinations.ai/two" },
    ];

    it("round-trips a trail through a link", () => {
        expect(decodeTrail(encodeTrail(trail))).toEqual(trail);
    });

    it("produces a link fragment that survives a url", () => {
        const encoded = encodeTrail(trail);
        expect(encoded).not.toMatch(/[+/=]/);
        expect(decodeTrail(encoded)).toEqual(trail);
    });

    it("refuses anything that is not a trail", () => {
        expect(decodeTrail("")).toBeNull();
        expect(decodeTrail("not base64 at all !!")).toBeNull();
        expect(decodeTrail(encodeTrail([]))).toBeNull();
    });

    it("refuses a trail with a link that is not safe to load", () => {
        const tampered = encodeTrail([
            { label: "a stop", url: "javascript:alert(1)" },
            { label: "b", url: "https://media.pollinations.ai/b" },
        ]);
        expect(decodeTrail(tampered)).toBeNull();
    });

    it("refuses a stop with no name", () => {
        expect(decodeTrail(encodeTrail([{ label: "", url: "https://media.pollinations.ai/x" }]))).toBeNull();
    });

    it("stops a shared trail at a walkable length", () => {
        const long: Trail = Array.from({ length: MAX_STOPS + 6 }, (_, index) => ({
            label: `stop ${index}`,
            url: `https://media.pollinations.ai/${index}`,
        }));
        expect(decodeTrail(encodeTrail(long))).toHaveLength(MAX_STOPS);
    });
});

/**
 * The walk itself: what a view offers, and the trail the player leaves
 * behind. Nothing here touches the network, so the whole shape of the game
 * can be tested without spending a single Pollen.
 */

import { MAX_PROMPT_CHARS, MAX_SPOTS, MAX_STOPS, MIN_SPOTS } from "./config.js";

/**
 * What the vision model is asked before it looks at a view. The shape of the
 * reply is the contract the whole game is built on, so it lives with the rest
 * of the game's rules rather than with the UI that consumes it.
 */
export const SPOTS_SYSTEM = `You find ways forward in an explorable scene.

Reply with ONLY a JSON object, no prose and no code fences:
{"spots":[{"label":"short name for the way","x":0.42,"y":0.68,"prompt":"what the player would see after stepping through, about 12 words"}]}

Return ${MIN_SPOTS} or ${MAX_SPOTS} spots.
x and y are fractions of the image width and height, marking the middle of each way forward.
Ways forward are doors, paths, windows, stairs, tunnels, bridges and gaps - things you can walk towards.
label is 2 to 4 words. prompt describes only the view beyond, never this one.`;

/** One way out of a view, located on the postcard. */
export type Spot = { label: string; x: number; y: number; prompt: string };

/** One view the player has stood in. */
export type Stop = { label: string; url: string };

export type Trail = Stop[];

/**
 * Pull the first JSON value out of a model reply. Models like to wrap answers
 * in prose or fence them with backticks, and neither should reach the caller.
 */
export const extractJson = (raw: string): unknown => {
    const unwrapped = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
    const start = unwrapped.search(/[[{]/);
    if (start < 0) throw new Error("no JSON in the reply");

    const opener = unwrapped[start];
    const closer = opener === "{" ? "}" : "]";
    const end = unwrapped.lastIndexOf(closer);
    if (end <= start) throw new Error("unterminated JSON in the reply");

    return JSON.parse(unwrapped.slice(start, end + 1));
};

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

const clamp = (value: number, low: number, high: number): number =>
    Math.min(high, Math.max(low, value));

/**
 * Turn the vision model's reply into markers that can actually be clicked.
 * Returns null when the reply cannot be trusted — a marker in the wrong place
 * sends the player somewhere the model never meant.
 */
export const parseSpots = (raw: string): Spot[] | null => {
    let decoded: unknown;
    try {
        decoded = extractJson(raw);
    } catch {
        return null;
    }

    const list = Array.isArray(decoded)
        ? decoded
        : typeof decoded === "object" && decoded !== null && "spots" in decoded
          ? (decoded as { spots: unknown }).spots
          : null;
    if (!Array.isArray(list)) return null;

    const spots: Spot[] = [];
    for (const entry of list) {
        if (typeof entry !== "object" || entry === null) continue;
        const record = entry as Record<string, unknown>;
        const label = record.label;
        const prompt = record.prompt ?? record.description;
        if (typeof label !== "string" || label.trim() === "") continue;
        if (typeof prompt !== "string" || prompt.trim() === "") continue;
        if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) continue;

        spots.push({
            label: label.trim().slice(0, 40),
            x: clamp(record.x, 0, 1),
            y: clamp(record.y, 0, 1),
            prompt: prompt.trim().slice(0, 240),
        });
        if (spots.length === MAX_SPOTS) break;
    }

    return spots.length >= MIN_SPOTS ? spots : null;
};

const trimTo = (text: string, limit: number): string =>
    text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;

/** The prompt that paints the very first view. */
export const scenePrompt = (scene: string, suffix: string): string =>
    trimTo(`${scene.trim()}, ${suffix}`, MAX_PROMPT_CHARS);

/**
 * What every step after the first has to say. The reference image carries the
 * look; without this the model repaints the same framing from the reference
 * and the walk never moves.
 */
const BEYOND_DIRECTIVE =
    "The player has stepped through, so paint a new camera position and angle, not the reference framing. Keep the same place and medium.";

/** The prompt that paints the view behind a clicked way forward. */
export const spotPrompt = (spot: Spot, suffix: string): string =>
    trimTo(`${BEYOND_DIRECTIVE} ${spot.prompt.trim()}, ${suffix}`, MAX_PROMPT_CHARS);

const toBase64Url = (text: string): string => {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string): string => {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
};

/** Pack a trail into a link. A walk is only worth sharing if it carries. */
export const encodeTrail = (trail: Trail): string => toBase64Url(JSON.stringify(trail));

/**
 * Unpack a shared link. Anything that is not a well-formed trail — truncated
 * by a chat client, edited by hand, too long to be a walk — comes back null so
 * the app starts fresh instead of rendering nonsense.
 */
export const decodeTrail = (value: string): Trail | null => {
    let decoded: unknown;
    try {
        decoded = JSON.parse(fromBase64Url(value));
    } catch {
        return null;
    }
    if (!Array.isArray(decoded) || decoded.length === 0) return null;

    const trail: Trail = [];
    for (const entry of decoded.slice(0, MAX_STOPS)) {
        if (typeof entry !== "object" || entry === null) return null;
        const record = entry as Record<string, unknown>;
        if (typeof record.label !== "string" || record.label.trim() === "") return null;
        if (typeof record.url !== "string" || !record.url.startsWith("https://")) return null;
        trail.push({ label: record.label.trim().slice(0, 60), url: record.url });
    }
    return trail.length > 0 ? trail : null;
};

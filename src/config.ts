/** Every endpoint, model and credential the app talks to. */

export const GEN_BASE = "https://gen.pollinations.ai";
export const ENTER_BASE = "https://enter.pollinations.ai";

/**
 * Publishable App Key (`pk_...`) for Bring Your Own Pollen. It identifies the
 * app on the consent screen; the spend is always the player's own Pollen.
 * Overridable at build time so the key never has to live in git history.
 */
export const CLIENT_ID: string =
    (import.meta.env.VITE_POLLINATIONS_CLIENT_ID as string | undefined) ?? "";

/** OAuth redirect target — must match a Redirect URI registered on the App Key. */
export const REDIRECT_URI: string =
    (import.meta.env.VITE_POLLINATIONS_REDIRECT_URI as string | undefined) ??
    (typeof window === "undefined"
        ? ""
        : `${window.location.origin}${window.location.pathname}`);

/**
 * Reads the view and reports the ways forward out of it. Vision-capable, so
 * one model both looks at the postcard and returns where the doors are.
 */
export const VISION_MODEL = "openai/gpt-5.4-nano";

/**
 * Paints the next postcard. Free, takes exactly one reference image, and
 * answers in around half a minute — fast enough that a walk stays a walk.
 */
export const IMAGE_MODEL = "microsoft/mai-image-2.6-flash";

/** Postcard proportion. Square reads best as a card in the trail strip. */
export const IMAGE_SIZE = "1024x1024";

/** Ways forward per view: enough to choose, few enough to read at a glance. */
export const MIN_SPOTS = 2;
export const MAX_SPOTS = 3;

/**
 * Where a trail stops being a stroll and starts being a walk you would rather
 * not share in one link.
 */
export const MAX_STOPS = 12;

/** Vision replies are one small object; anything longer is a broken reply. */
export const MAX_REPLY_CHARS = 4_000;

/**
 * Prompts are rewritten as the walk continues, so they are capped rather than
 * allowed to grow with every step. The reference image carries the look; the
 * prompt only has to carry the place.
 */
export const MAX_PROMPT_CHARS = 600;

/** The look every view is asked for, so the first card sets the tone. */
export type Style = { id: string; name: string; suffix: string };

export const STYLES: readonly Style[] = [
    {
        id: "postcard",
        name: "Watercolour postcard",
        suffix: "watercolour postcard painting, deckled paper edge, soft muted palette",
    },
    {
        id: "ink",
        name: "Ink and wash",
        suffix: "ink and wash drawing, fine pen hatching, restrained washes",
    },
    {
        id: "riso",
        name: "Risograph",
        suffix: "risograph print, limited spot colours, coarse halftone",
    },
    {
        id: "oil",
        name: "Oil sketch",
        suffix: "loose oil sketch, visible brushwork, warm underpainting",
    },
    {
        id: "nocturne",
        name: "Nocturne",
        suffix: "nocturne painting, deep blues, a single warm light source",
    },
];

export const styleById = (id: string): Style =>
    STYLES.find((style) => style.id === id) ?? STYLES[0];

import { ApiError, askVision, generateImage } from "./api.js";
import { beginAuthorization, completeAuthorization, isSignedIn } from "./auth.js";
import { MAX_SPOTS, MAX_STOPS, MIN_SPOTS, STYLES, styleById } from "./config.js";
import { button, clear, h, on } from "./dom.js";
import {
    decodeTrail,
    encodeTrail,
    parseSpots,
    scenePrompt,
    spotPrompt,
    SPOTS_SYSTEM,
    type Spot,
    type Trail,
} from "./world.js";

let screen: "start" | "explore" = "start";
let trail: Trail = [];
let spots: Spot[] = [];
let styleId = STYLES[0].id;
let sceneDraft = "";
let busy = false;
let busyLabel = "";
let errorMessage = "";
let shareOpen = false;
let copied = false;

const root = () => document.getElementById("app") as HTMLElement;

const messageOf = (error: unknown): string =>
    error instanceof ApiError
        ? error.message
        : "Something went wrong. Try again.";

const run = async (label: string, work: () => Promise<void>): Promise<void> => {
    if (busy) return;
    busy = true;
    busyLabel = label;
    errorMessage = "";
    render();
    try {
        await work();
    } catch (error) {
        errorMessage = messageOf(error);
    } finally {
        busy = false;
        busyLabel = "";
        render();
    }
};

/** Current view, or undefined when there is no walk under way. */
const currentStop = () => trail[trail.length - 1];

/** Read the ways forward out of the view the player is standing in. */
const lookAround = async (): Promise<void> => {
    const stop = currentStop();
    if (!stop) return;
    spots = [];
    busyLabel = "Reading the view…";
    render();
    const found = parseSpots(await askVision(SPOTS_SYSTEM, "Find the ways forward.", stop.url));
    if (!found) {
        throw new ApiError("No way forward could be read from that view. Look again.");
    }
    spots = found;
};

const begin = () => {
    const scene = sceneDraft.trim();
    if (!scene) {
        errorMessage = "Type somewhere to begin.";
        render();
        return;
    }
    const suffix = styleById(styleId).suffix;
    return run("Painting the first postcard…", async () => {
        const url = await generateImage(scenePrompt(scene, suffix));
        trail = [{ label: scene.slice(0, 60), url }];
        screen = "explore";
        shareOpen = false;
        await lookAround();
    });
};

const step = (spot: Spot) => {
    const stop = currentStop();
    if (!stop) return;
    const suffix = styleById(styleId).suffix;
    return run("Painting the next postcard…", async () => {
        const url = await generateImage(spotPrompt(spot, suffix), stop.url);
        trail = [...trail, { label: spot.label, url }];
        shareOpen = false;
        await lookAround();
    });
};

const jump = (index: number) =>
    run("Going back to that view…", async () => {
        trail = trail.slice(0, index + 1);
        shareOpen = false;
        await lookAround();
    });

const lookAgain = () => run("Reading the view…", lookAround);

const reset = () => {
    trail = [];
    spots = [];
    shareOpen = false;
    copied = false;
    errorMessage = "";
    screen = "start";
    render();
};

const trailUrl = (): string =>
    `${window.location.origin}${window.location.pathname}#t=${encodeTrail(trail)}`;

const share = async () => {
    shareOpen = !shareOpen;
    copied = false;
    if (shareOpen) {
        try {
            await navigator.clipboard.writeText(trailUrl());
            copied = true;
        } catch {
            /* the link is on screen either way, so a blocked clipboard is fine */
        }
    }
    render();
};

const footer = () =>
    h(
        "footer",
        { class: "foot" },
        h(
            "p",
            {},
            "Powered by ",
            h("a", {
                href: "https://pollinations.ai",
                target: "_blank",
                rel: "noreferrer",
                text: "Pollinations",
            }),
            " · ",
            h("a", {
                href: "https://gen.pollinations.ai/docs",
                target: "_blank",
                rel: "noreferrer",
                text: "API docs",
            }),
            " · ",
            h("a", {
                href: "https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md",
                target: "_blank",
                rel: "noreferrer",
                text: "Bring your own Pollen",
            }),
        ),
    );

const heading = (title: string, sub: string) =>
    h(
        "header",
        { class: "head" },
        h("p", { class: "mark", text: "Wanderpost" }),
        h("h1", { text: title }),
        h("p", { class: "sub", text: sub }),
    );

const shell = (...nodes: (Node | null | false | undefined)[]) => {
    const node = root();
    clear(node);
    for (const child of nodes) if (child) node.appendChild(child);
    if (busy) {
        node.appendChild(h("p", { class: "busy", text: busyLabel, role: "status" }));
    }
    if (errorMessage) {
        node.appendChild(h("div", { id: "error", class: "error", text: errorMessage }));
    }
    node.appendChild(footer());
};

const signInBlock = () =>
    isSignedIn()
        ? h("p", { class: "signed", text: "Signed in — the walk runs on your Pollen." })
        : button("Sign in with your Pollen", () => void beginAuthorization(), "ghost");

const renderStart = () => {
    shell(
        heading(
            "Walk into a picture.",
            "Type a scene, then click a door, path or window. Each view is painted from the one before it.",
        ),
        h(
            "section",
            { class: "card" },
            signInBlock(),
            h(
                "label",
                { class: "field", for: "scene" },
                h("span", { text: "Where do you want to be?" }),
                h("input", {
                    id: "scene",
                    class: "scene",
                    type: "text",
                    placeholder: "a flooded subway station under a neon city",
                    value: sceneDraft,
                    oninput: (event: Event) => {
                        sceneDraft = (event.target as HTMLInputElement).value;
                    },
                }),
            ),
            h(
                "div",
                { class: "styles", role: "group", "aria-label": "Art style" },
                ...STYLES.map((style) =>
                    on(
                        h(
                            "button",
                            {
                                class: `style${style.id === styleId ? " picked" : ""}`,
                                type: "button",
                                "aria-pressed": String(style.id === styleId),
                                text: style.name,
                            },
                        ),
                        "click",
                        () => {
                            styleId = style.id;
                            render();
                        },
                    ),
                ),
            ),
            button("Begin the walk", () => void begin()),
            h("p", {
                class: "fine",
                text: `${MIN_SPOTS}–${MAX_SPOTS} ways forward in every view, up to ${MAX_STOPS} views. Painted on your own Pollen.`,
            }),
        ),
    );
};

const markers = () =>
    h(
        "div",
        { class: "spots" },
        ...spots.map((spot) =>
            on(
                h(
                    "button",
                    {
                        class: `spot${spot.y > 0.7 ? " above" : ""}`,
                        type: "button",
                        style: `left:${(spot.x * 100).toFixed(2)}%;top:${(spot.y * 100).toFixed(2)}%`,
                        "aria-label": `Go ${spot.label}`,
                    },
                    h("span", { class: "pin", "aria-hidden": "true" }),
                    h("span", { class: "spotlabel", text: spot.label }),
                ),
                "click",
                () => void step(spot),
            ),
        ),
    );

const trailStrip = () =>
    h(
        "nav",
        { class: "trail", "aria-label": "Places you have been" },
        ...trail.map((stop, index) =>
            on(
                h(
                    "button",
                    {
                        class: `crumb${index === trail.length - 1 ? " here" : ""}`,
                        type: "button",
                        "aria-label": `Back to view ${index + 1}: ${stop.label}`,
                    },
                    h("img", { src: stop.url, alt: "", loading: "lazy" }),
                    h("span", { class: "crumbnum", text: String(index + 1) }),
                ),
                "click",
                () => void jump(index),
            ),
        ),
    );

const sharePanel = () =>
    h(
        "div",
        { class: "share" },
        h("label", { for: "trail-link", text: "Anyone with this link walks the same trail." }),
        h("input", {
            id: "trail-link",
            class: "linkfield",
            type: "text",
            readonly: true,
            value: trailUrl(),
        }),
        h("p", { class: "fine", text: copied ? "Link copied." : "Copy it from the box above." }),
    );

const renderExplore = () => {
    const stop = currentStop();
    if (!stop) {
        reset();
        return;
    }
    const atEnd = trail.length >= MAX_STOPS;
    const style = styleById(styleId);

    shell(
        heading(stop.label, `View ${trail.length} of ${MAX_STOPS} · ${style.name}`),
        h(
            "figure",
            { class: "view" },
            h("img", { src: stop.url, alt: stop.label }),
            spots.length > 0 && !atEnd ? markers() : null,
        ),
        trailStrip(),
        atEnd
            ? h("p", { class: "fine", text: "That walk has gone far enough. Start a new one." })
            : spots.length === 0
              ? h("p", { class: "fine", text: "No way forward could be read from this view." })
              : null,
        h(
            "div",
            { class: "tools" },
            spots.length === 0 && !busy ? button("Look again", () => void lookAgain(), "ghost") : null,
            button(shareOpen ? "Hide link" : "Share this trail", () => void share(), "ghost"),
            button("Start a new walk", reset, "ghost"),
        ),
        shareOpen ? sharePanel() : null,
        !isSignedIn() ? signInBlock() : null,
    );
};

export const render = () => {
    if (screen === "explore" && currentStop()) renderExplore();
    else renderStart();
};

/** Open a trail found in the link. Returns false when the link holds none. */
const openSharedTrail = async (): Promise<boolean> => {
    const hash = window.location.hash.startsWith("#t=")
        ? window.location.hash.slice(3)
        : "";
    const shared = hash ? decodeTrail(hash) : null;
    if (!shared) return false;

    trail = shared;
    spots = [];
    screen = "explore";
    shareOpen = false;
    copied = false;
    errorMessage = "";
    render();

    if (isSignedIn()) {
        await run("Reading the view…", lookAround);
    } else {
        errorMessage = "Sign in with your Pollen to keep walking this trail.";
        render();
    }
    return true;
};

/** Load, finish any sign-in round trip, then open a shared trail if there is one. */
export const boot = async (): Promise<void> => {
    await completeAuthorization();

    // Pasting a shared link into a tab that is already open only changes the
    // hash — no reload happens, so the link has to be read here too.
    window.addEventListener("hashchange", () => void openSharedTrail());

    if (await openSharedTrail()) return;
    render();
};

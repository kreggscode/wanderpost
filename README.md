# Wanderpost

**Explorable postcard worlds.** Type a scene, then click the doors, paths and
windows in the picture to step into the next view — one painted postcard at a
time.

Built for [pollinations/pollinations](https://github.com/pollinations/pollinations) quest **#15728**.

**Play it:** https://kreggscode.github.io/wanderpost/

## How it plays

1. **Type a scene.** "a flooded subway station under a neon city", "a market
   street in the rain", anything. Pick how you want it drawn.
2. **Step in.** The first postcard is painted from your scene.
3. **Click a way forward.** A vision model reads the picture and marks the
   2–3 ways out of it — doors, paths, windows, stairs, tunnels, bridges —
   where they actually are in the image.
4. **Keep walking.** Each view is generated **with the previous view as a
   reference image**, so the world keeps its look: the same paper, the same
   light, the same style, view after view.
5. **Follow the trail back.** The breadcrumb strip along the bottom is a map
   of everywhere you have been. Click any thumbnail to return to that view.
6. **Share it.** *Share this trail* packs the whole walk into a link. Anyone
   who opens it lands on your last view and can keep walking from there.

## The trick that makes it one world

Style consistency comes from passing the previous view as a reference image:

```
POST /v1/images/generations
{
  "prompt":  "a lantern-lit wooden footbridge over a stream, watercolour postcard",
  "model":   "microsoft/mai-image-2.6-flash",
  "image":   ["https://media.pollinations.ai/<the previous view>"]
}
```

The model copies what it is shown — the deckled paper edge, the watercolour
washes, the palette — so a walk stays one world instead of five unrelated
pictures. The reference is a public Pollinations URL, which is what the
previous call just returned.

## What it calls

| Step | Endpoint | Model |
| --- | --- | --- |
| Paint a view | `POST /v1/images/generations` | `microsoft/mai-image-2.6-flash` |
| Find the ways forward | `POST /v1/chat/completions` | `openai/gpt-5.4-nano` |

## Bring your own Pollen

Sign-in uses PKCE with a publishable App Key (earnings disabled). The key is
public in the JavaScript bundle by design — what it cannot reach is your
account — and the token lives in `sessionStorage` for the tab only. Without a
sign-in the game refuses to paint anything rather than quietly spending
someone else's Pollen.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/wanderpost/
npm run lint       # tsc --noEmit
npm test           # 28 tests, including a live paint + read + repaint round trip
npx playwright test   # 4 end-to-end tests against the built app
```

`POLLINATIONS_API_KEY` enables the live integration tests; without them that
suite skips, so CI stays green. `E2E_BASE_URL=https://kreggscode.github.io/wanderpost/`
runs the same specs against production, which also enables the consent-screen
test.

Screenshots of a full walk are in [`evidence/`](evidence).

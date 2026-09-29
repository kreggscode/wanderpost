import { getToken } from "./auth.js";
import {
    GEN_BASE,
    IMAGE_MODEL,
    IMAGE_SIZE,
    MAX_REPLY_CHARS,
    VISION_MODEL,
} from "./config.js";
import { extractJson } from "./world.js";

export class ApiError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.status = status;
    }
}

const authorized = () => {
    const token = getToken();
    if (!token) throw new ApiError("Sign in with your Pollen to start a walk.", 401);
    return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
};

const describe = async (response: Response): Promise<string> => {
    try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body.error?.message) return body.error.message;
    } catch {
        /* fall through to the status line */
    }
    return `Pollinations responded with ${response.status}.`;
};

/**
 * Paint one view. `reference` is the previous postcard, and it is the whole
 * trick: the model copies its look, so a walk stays one world instead of
 * five unrelated pictures.
 */
export const generateImage = async (
    prompt: string,
    reference?: string,
): Promise<string> => {
    const response = await fetch(`${GEN_BASE}/v1/images/generations`, {
        method: "POST",
        headers: authorized(),
        body: JSON.stringify({
            prompt,
            model: IMAGE_MODEL,
            size: IMAGE_SIZE,
            n: 1,
            response_format: "url",
            ...(reference ? { image: [reference] } : {}),
        }),
    });
    if (!response.ok) throw new ApiError(await describe(response), response.status);

    const payload = (await response.json()) as {
        data?: { url?: unknown }[];
    };
    const url = payload.data?.[0]?.url;
    if (typeof url !== "string" || !url.startsWith("https://")) {
        throw new ApiError("That postcard did not develop. Try again.");
    }
    return url;
};

/** Look at a view and say what is in it. */
export const askVision = async (
    system: string,
    prompt: string,
    imageUrl: string,
): Promise<string> => {
    const response = await fetch(`${GEN_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: authorized(),
        body: JSON.stringify({
            model: VISION_MODEL,
            temperature: 0.2,
            messages: [
                { role: "system", content: system },
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: imageUrl } },
                    ],
                },
            ],
        }),
    });
    if (!response.ok) throw new ApiError(await describe(response), response.status);

    const payload = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
        throw new ApiError("Nothing could be read from that view. Try again.");
    }
    return content.slice(0, MAX_REPLY_CHARS);
};

/** Model replies arrive wrapped in prose or fences; the caller wants data. */
export const parseJson = <T,>(raw: string): T => {
    try {
        return extractJson(raw) as T;
    } catch {
        throw new ApiError("That came back as gibberish. Try again.");
    }
};

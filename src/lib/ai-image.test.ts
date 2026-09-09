import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AiModelUnknownError,
  AiProviderNotConfiguredError,
  generateImage,
} from "@/lib/ai-chat";

/**
 * Making a picture, with the network stood in for.
 *
 * This is the only path in the assistant that writes a new file to disk, so the
 * things worth pinning are the ones that end with bytes somewhere they should
 * not be: a model that cannot draw being asked to, a provider's refusal turned
 * into a shrug, and a response that is not really a picture being saved as one.
 *
 * One of these is a security property rather than a correctness one — see the
 * note on the key and the URL.
 */

const REAL_KEY = "test-key-abcdefghijklmnopqrstuvwxyz";

/** Stands in for the network and records exactly what was sent. */
function captureFetch(response: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return response();
  });
  return calls;
}

const onePixelPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function googleOk(base64 = onePixelPng, mimeType = "image/png") {
  return new Response(
    JSON.stringify({ predictions: [{ bytesBase64Encoded: base64, mimeType }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function openAiOk(base64 = onePixelPng) {
  return new Response(JSON.stringify({ data: [{ b64_json: base64 }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("what it refuses before reaching the network", () => {
  it("refuses a model that cannot draw, by name", async () => {
    // The product decision, as an assertion: Claude does not make pictures, so
    // asking it to must fail here rather than at a provider that would answer
    // with prose and leave us saving that as a PNG.
    vi.stubEnv("ANTHROPIC_API_KEY", REAL_KEY);
    const calls = captureFetch(() => new Response("{}", { status: 200 }));

    await expect(
      generateImage({ modelId: "claude-opus-5", prompt: "a cat" }),
    ).rejects.toThrow(/does not make pictures/i);

    expect(calls).toHaveLength(0);
  });

  it("refuses a chat model from a provider that can draw with a different one", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", REAL_KEY);
    captureFetch(() => googleOk());

    await expect(
      generateImage({ modelId: "gemini-2.5-pro", prompt: "a cat" }),
    ).rejects.toThrow(/does not make pictures/i);
  });

  it("refuses a model it has never heard of", async () => {
    await expect(generateImage({ modelId: "dall-e-2", prompt: "a cat" })).rejects.toBeInstanceOf(
      AiModelUnknownError,
    );
  });

  it("names the variable to set when the key is missing", async () => {
    // This message is what the interface shows, so the variable's name is the
    // useful half of it.
    const error = await generateImage({
      modelId: "imagen-3.0-generate-002",
      prompt: "a cat",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderNotConfiguredError);
    expect((error as AiProviderNotConfiguredError).envVar).toBe("GOOGLE_AI_API_KEY");
  });

  it("treats a placeholder key as no key at all", async () => {
    vi.stubEnv("OPENAI_API_KEY", "<your-openai-api-key>");
    await expect(
      generateImage({ modelId: "gpt-image-1", prompt: "a cat" }),
    ).rejects.toBeInstanceOf(AiProviderNotConfiguredError);
  });
});

describe("what it sends", () => {
  /*
   * A security property, not a style choice.
   *
   * Google's image API accepts the key as `?key=…`, and that is the shape most
   * examples use. A key in a query string is written into every proxy log,
   * every access log and the browser history of anyone who pastes the URL — and
   * unlike a leaked header it is leaked by infrastructure nobody in this
   * project controls. It goes in a header, and this is what stops somebody
   * "simplifying" it back.
   */
  it("never puts the key in the URL", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", REAL_KEY);
    const calls = captureFetch(() => googleOk());

    await generateImage({ modelId: "imagen-3.0-generate-002", prompt: "a cat" });

    expect(calls[0].url).not.toContain(REAL_KEY);
    expect(calls[0].url).not.toContain("key=");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe(REAL_KEY);
  });

  it("sends the OpenAI key as a bearer token, not in the URL", async () => {
    vi.stubEnv("OPENAI_API_KEY", REAL_KEY);
    const calls = captureFetch(() => openAiOk());

    await generateImage({ modelId: "gpt-image-1", prompt: "a cat" });

    expect(calls[0].url).not.toContain(REAL_KEY);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${REAL_KEY}`,
    );
  });

  it("sends the prompt, and the model it was asked for", async () => {
    vi.stubEnv("OPENAI_API_KEY", REAL_KEY);
    const calls = captureFetch(() => openAiOk());

    await generateImage({ modelId: "gpt-image-1", prompt: "a heron at dawn" });

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.prompt).toBe("a heron at dawn");
    expect(body.model).toBe("gpt-image-1");
  });
});

describe("what it does with the answer", () => {
  it("decodes the picture into real bytes", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", REAL_KEY);
    captureFetch(() => googleOk());

    const { bytes, mime } = await generateImage({
      modelId: "imagen-3.0-generate-002",
      prompt: "a cat",
    });

    expect(mime).toBe("image/png");
    // The real PNG signature, so this is a decode rather than a string copy.
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("takes the provider's own type when it gives one", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", REAL_KEY);
    captureFetch(() => googleOk(onePixelPng, "image/jpeg"));

    const { mime } = await generateImage({
      modelId: "imagen-3.0-generate-002",
      prompt: "a cat",
    });
    expect(mime).toBe("image/jpeg");
  });

  /*
   * The provider's own words, not a shrug.
   *
   * "The picture could not be made" when the provider said "you have exceeded
   * your quota" costs somebody an afternoon of looking in the wrong place.
   */
  it("passes the provider's refusal through", async () => {
    vi.stubEnv("OPENAI_API_KEY", REAL_KEY);
    captureFetch(
      () =>
        new Response(JSON.stringify({ error: { message: "Billing hard limit has been reached" } }), {
          status: 400,
        }),
    );

    await expect(generateImage({ modelId: "gpt-image-1", prompt: "a cat" })).rejects.toThrow(
      /Billing hard limit/,
    );
  });

  it("still says something useful when the error body is not JSON", async () => {
    // A gateway between here and the provider answers with an HTML page, and
    // `response.json()` throws on it.
    vi.stubEnv("OPENAI_API_KEY", REAL_KEY);
    captureFetch(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    await expect(generateImage({ modelId: "gpt-image-1", prompt: "a cat" })).rejects.toThrow(
      /502/,
    );
  });

  it("refuses a success that carries no picture", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", REAL_KEY);
    captureFetch(() => new Response(JSON.stringify({ predictions: [] }), { status: 200 }));

    await expect(
      generateImage({ modelId: "imagen-3.0-generate-002", prompt: "a cat" }),
    ).rejects.toThrow(/no picture/i);
  });

  /*
   * `Buffer.from(x, "base64")` does not throw on rubbish — it skips whatever it
   * cannot decode and hands back what is left, which for a short enough string
   * is nothing at all. Without a length check the caller writes a zero-byte
   * file to disk and creates a message row pointing at it, and the failure
   * shows up later as a broken image icon in somebody's conversation with no
   * error anywhere behind it.
   */
  it("refuses a body whose picture does not decode to anything", async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", REAL_KEY);
    captureFetch(() => googleOk("!!!!"));

    await expect(
      generateImage({ modelId: "imagen-3.0-generate-002", prompt: "a cat" }),
    ).rejects.toThrow(/no picture/i);
  });
});

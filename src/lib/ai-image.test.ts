import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateImage } from "@/lib/ai-chat";

/**
 * The free, keyless image path. The network is the one double — a test must
 * never reach the real service — so `fetch` is stubbed and what matters is that
 * the prompt reaches a *fixed* host url-encoded, and that a bad response is
 * refused rather than saved as a blank picture.
 */
describe("generateImage — free built-in", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws through the public image service with no key, and trims the watermark strip", async () => {
    // A real 100×100 picture so the watermark-trimming step can process it.
    const source = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    let calledUrl = "";
    vi.stubGlobal("fetch", async (url: string) => {
      calledUrl = String(url);
      return new Response(new Uint8Array(source), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });

    const result = await generateImage({ modelId: "kanovra-image", prompt: "a red fox" });
    expect(calledUrl.startsWith("https://image.pollinations.ai/prompt/")).toBe(true);
    expect(calledUrl).toContain(encodeURIComponent("a red fox"));
    expect(result.mime).toBe("image/jpeg");

    // The bottom strip (with the watermark) is gone: shorter, but only a little.
    const meta = await sharp(result.bytes).metadata();
    expect(meta.height).toBeLessThan(100);
    expect(meta.height).toBeGreaterThan(85);
    expect(meta.width).toBe(100);
  });

  it("refuses a response that is not an image", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("<html>error</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    await expect(generateImage({ modelId: "kanovra-image", prompt: "x" })).rejects.toThrow(
      /not return a picture/,
    );
  });

  it("refuses an empty body rather than saving a blank", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(new Uint8Array([]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    );
    await expect(generateImage({ modelId: "kanovra-image", prompt: "x" })).rejects.toThrow(
      /no picture/,
    );
  });
});

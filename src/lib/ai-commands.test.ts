import { describe, expect, it } from "vitest";

import {
  cleanImagePrompt,
  cleanName,
  looksLikeImageRequest,
  looksLikeQuestion,
  parseAiCommand,
} from "@/lib/ai-commands";

describe("parseAiCommand — projects", () => {
  it("creates a project and pulls the name out of a natural request", () => {
    expect(parseAiCommand("tạo cho tôi một project có tên là Duc đi")).toEqual({
      kind: "create-project",
      name: "Duc",
    });
    expect(parseAiCommand("tạo project tên Marketing Q3")).toEqual({
      kind: "create-project",
      name: "Marketing Q3",
    });
    expect(parseAiCommand("tạo cho tôi 1 project tên là Website")).toEqual({
      kind: "create-project",
      name: "Website",
    });
  });

  it("reads a quoted name and an English request", () => {
    expect(parseAiCommand('create a project named "Website Redesign"')).toEqual({
      kind: "create-project",
      name: "Website Redesign",
    });
  });

  it("asks for a name when a create is clear but none is given", () => {
    expect(parseAiCommand("tạo project")).toEqual({ kind: "need-name", resource: "project" });
  });
});

describe("parseAiCommand — maps", () => {
  it("creates a supported map kind with its title", () => {
    expect(parseAiCommand("tạo map circle tên Quy trình bán hàng")).toEqual({
      kind: "create-map",
      type: "CIRCLE",
      title: "Quy trình bán hàng",
    });
    expect(parseAiCommand("tạo cho tôi một map tree tên Cấu trúc team")).toEqual({
      kind: "create-map",
      type: "TREE",
      title: "Cấu trúc team",
    });
  });

  it("leaves the title blank (for a default) when only a kind is named", () => {
    expect(parseAiCommand("tạo map circle")).toEqual({
      kind: "create-map",
      type: "CIRCLE",
      title: "",
    });
  });

  it("apologises for a map kind the app does not have", () => {
    expect(parseAiCommand("tạo map spider tên gì đó")).toEqual({ kind: "unsupported-map" });
  });
});

describe("parseAiCommand — not a command", () => {
  it("never executes a question", () => {
    expect(parseAiCommand("làm sao để tạo project")).toBeNull();
    expect(parseAiCommand("project là gì")).toBeNull();
    expect(parseAiCommand("how do I create a map")).toBeNull();
  });

  it("ignores a message with no create verb or no project/map target", () => {
    expect(parseAiCommand("Kanovra là gì")).toBeNull();
    expect(parseAiCommand("vẽ cho tôi con mèo")).toBeNull();
    // An image request ("create a cat picture") is not a project/map command,
    // so it falls through to the image path rather than being intercepted.
    expect(parseAiCommand("tạo hình con mèo")).toBeNull();
  });
});

describe("looksLikeQuestion", () => {
  it("treats an explain/meaning request as a question (so image mode won't draw it)", () => {
    expect(looksLikeQuestion("giải thích cho tôi ý nghĩa của logo này")).toBe(true);
    expect(looksLikeQuestion("Kanovra là gì?")).toBe(true);
    expect(looksLikeQuestion("tại sao bầu trời màu xanh")).toBe(true);
    expect(looksLikeQuestion("explain this picture")).toBe(true);
  });

  it("treats a make-a-picture instruction as not a question", () => {
    expect(looksLikeQuestion("tạo cho tôi một ảnh về logo kanovra")).toBe(false);
    expect(looksLikeQuestion("vẽ một con mèo đang ngủ")).toBe(false);
    expect(looksLikeQuestion("a golden emblem with a flower")).toBe(false);
  });
});

describe("looksLikeImageRequest", () => {
  it("reads a picture request even when it mentions a map (so it isn't taken as create-map)", () => {
    expect(looksLikeImageRequest("hãy tạo cho tôi một ảnh về 1 mindmap bất kỳ")).toBe(true);
    expect(looksLikeImageRequest("tạo ảnh logo kanovra")).toBe(true);
    expect(looksLikeImageRequest("vẽ một con mèo")).toBe(true);
    expect(looksLikeImageRequest("a picture of a mountain")).toBe(true);
  });

  it("does not mistake a real project/map create for a picture request", () => {
    expect(looksLikeImageRequest("tạo project tên Ảnh Đẹp")).toBe(false);
    expect(looksLikeImageRequest("tạo map circle tên Quy trình")).toBe(false);
    expect(looksLikeImageRequest("tạo project cấu hình hệ thống")).toBe(false);
  });
});

describe("cleanImagePrompt", () => {
  it("peels the request scaffolding down to the subject", () => {
    expect(cleanImagePrompt("hãy tạo cho tôi một ảnh về 1 mindmap bất kỳ")).toBe("mindmap");
    expect(cleanImagePrompt("vẽ một con mèo đang ngủ")).toBe("con mèo đang ngủ");
    expect(cleanImagePrompt("tạo ảnh logo kanovra")).toBe("logo kanovra");
    expect(cleanImagePrompt("a picture of a mountain at sunset")).toBe("mountain at sunset");
  });

  it("keeps a subject with no scaffolding, and reduces a bare 'draw a picture' to its noun", () => {
    expect(cleanImagePrompt("con rồng")).toBe("con rồng");
    expect(cleanImagePrompt("vẽ ảnh")).toBe("ảnh");
  });
});

describe("cleanName", () => {
  it("strips leading articles and trailing particles", () => {
    expect(cleanName("một Duc đi")).toBe("Duc");
    expect(cleanName("Marketing nhé")).toBe("Marketing");
    expect(cleanName("Website Redesign please")).toBe("Website Redesign");
  });
});

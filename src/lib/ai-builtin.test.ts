import { describe, expect, it } from "vitest";

import { builtinChunks, builtinReply, detectLang, matchEntry } from "@/lib/ai-builtin";

describe("detectLang", () => {
  it("reads Vietnamese from its diacritics", () => {
    expect(detectLang("Tạo map thế nào?")).toBe("vi");
    expect(detectLang("làm sao để đổi màu node")).toBe("vi");
  });

  it("reads Vietnamese typed without diacritics", () => {
    expect(detectLang("lam sao tao map")).toBe("vi");
    expect(detectLang("xoa node the nao")).toBe("vi");
  });

  it("reads plain English as English", () => {
    expect(detectLang("how do I create a map")).toBe("en");
    expect(detectLang("share a board")).toBe("en");
  });
});

describe("matchEntry", () => {
  it("routes common questions to the right entry, accent or none", () => {
    expect(matchEntry("tạo map thế nào")?.id).toBe("map-create");
    expect(matchEntry("how do I create a map")?.id).toBe("map-create");
    expect(matchEntry("xoá node")?.id).toBe("map-delete-node");
    expect(matchEntry("chia sẻ board")?.id).toBe("share");
    expect(matchEntry("đổi màu node")?.id).toBe("map-color");
    expect(matchEntry("phóng to node")?.id).toBe("map-resize");
  });

  it("does not confuse deleting a map with deleting a node", () => {
    expect(matchEntry("xoá map")?.id).toBe("map-delete-map");
    expect(matchEntry("xoá node")?.id).toBe("map-delete-node");
  });

  it("returns null when nothing matches", () => {
    expect(matchEntry("what is the weather in Hanoi")).toBeNull();
    expect(matchEntry("qwerty zxcvb")).toBeNull();
  });
});

describe("builtinReply", () => {
  it("answers in the language it was asked in", () => {
    const vi = builtinReply("tạo map thế nào");
    const en = builtinReply("how do I create a map");
    expect(vi).toContain("New map");
    expect(vi).toMatch(/thanh bên|đặt tên/);
    expect(en).toMatch(/left sidebar|top right/);
    expect(en).not.toMatch(/thanh bên/);
  });

  it("falls back helpfully, in the asker's language", () => {
    expect(builtinReply("what is the weather")).toMatch(/not sure|maps/i);
    expect(builtinReply("thời tiết hôm nay")).toMatch(/chưa chắc|map/i);
  });

  it("never returns an empty answer", () => {
    for (const q of ["", "   ", "asdf", "tạo map", "share board", "roles"]) {
      expect(builtinReply(q).trim().length).toBeGreaterThan(0);
    }
  });
});

describe("builtinChunks", () => {
  it("streams in pieces that rejoin to the original", () => {
    const text = builtinReply("tạo map thế nào");
    const chunks = builtinChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text);
  });

  it("gives at least one piece even for a short string", () => {
    expect(builtinChunks("hi").join("")).toBe("hi");
    expect(builtinChunks("hi").length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import { formatTaskCount, openTaskCount } from "@/lib/mind-map-canvas";

describe("formatTaskCount", () => {
  it("writes zero plainly and pads/pluralises the rest", () => {
    expect(formatTaskCount(0)).toBe("0 Task");
    expect(formatTaskCount(1)).toBe("01 Task");
    expect(formatTaskCount(2)).toBe("02 Tasks");
    expect(formatTaskCount(9)).toBe("09 Tasks");
    expect(formatTaskCount(10)).toBe("10 Tasks");
  });

  it("never goes negative", () => {
    expect(formatTaskCount(-3)).toBe("0 Task");
  });
});

describe("openTaskCount", () => {
  it("counts only the tasks that are not done", () => {
    expect(
      openTaskCount({
        tasks: [
          { id: "a", text: "one", done: false },
          { id: "b", text: "two", done: true },
          { id: "c", text: "three", done: false },
        ],
      }),
    ).toBe(2);
  });

  it("is zero for a node with no tasks", () => {
    expect(openTaskCount({ tasks: null })).toBe(0);
    expect(openTaskCount({ tasks: undefined })).toBe(0);
    expect(openTaskCount({ tasks: [] })).toBe(0);
  });
});

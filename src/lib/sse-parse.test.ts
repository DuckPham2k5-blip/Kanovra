import { describe, expect, it } from "vitest";

import { parseJsonFrame, SseDecoder } from "@/lib/sse-parse";

/**
 * The bug this module exists to prevent, written as tests.
 *
 * Every one of these passes for a parser that splits each chunk on newlines —
 * except the ones that split a line across chunks, which is what a real network
 * does and a mock never does.
 */

describe("SseDecoder", () => {
  it("reads whole lines from one chunk", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a":1}\ndata: {"a":2}\n')).toEqual(['{"a":1}', '{"a":2}']);
  });

  /*
   * The one that matters. A JSON object arriving in two pieces must come out
   * as one payload, not as two broken halves and not as nothing.
   */
  it("joins a payload split across two chunks", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"delta":{"te')).toEqual([]);
    expect(d.push('xt":"hello"}}\n')).toEqual(['{"delta":{"text":"hello"}}']);
  });

  it("joins a payload split one character at a time", () => {
    const d = new SseDecoder();
    const frame = 'data: {"text":"hi"}\n';
    const out: string[] = [];
    for (const ch of frame) out.push(...d.push(ch));
    expect(out).toEqual(['{"text":"hi"}']);
  });

  it("survives a chunk that ends exactly on the newline", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a":1}')).toEqual([]);
    expect(d.push("\n")).toEqual(['{"a":1}']);
  });

  it("handles several payloads and a partial one in a single chunk", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a":1}\ndata: {"a":2}\ndata: {"a":')).toEqual(['{"a":1}', '{"a":2}']);
    expect(d.push('3}\n')).toEqual(['{"a":3}']);
  });

  it("accepts CRLF as well as LF", () => {
    const d = new SseDecoder();
    expect(d.push('data: {"a":1}\r\n')).toEqual(['{"a":1}']);
  });

  it("skips blank lines, comments and non-data fields", () => {
    const d = new SseDecoder();
    const chunk = [
      "",
      ": keep-alive",
      "event: message_start",
      "id: 42",
      'data: {"a":1}',
      "",
    ].join("\n");
    expect(d.push(`${chunk}\n`)).toEqual(['{"a":1}']);
  });

  it("passes [DONE] through rather than swallowing it", () => {
    // The caller decides what a terminator means. Eating it here would leave
    // them unable to tell a finished stream from a dropped connection.
    const d = new SseDecoder();
    expect(d.push("data: [DONE]\n")).toEqual(["[DONE]"]);
  });

  it("tolerates no space after the colon", () => {
    const d = new SseDecoder();
    expect(d.push('data:{"a":1}\n')).toEqual(['{"a":1}']);
  });

  describe("flush", () => {
    it("returns nothing when the stream ended cleanly", () => {
      const d = new SseDecoder();
      d.push('data: {"a":1}\n');
      expect(d.flush()).toEqual([]);
    });

    it("hands back a final line that arrived without its newline", () => {
      const d = new SseDecoder();
      expect(d.push('data: {"a":1}')).toEqual([]);
      expect(d.flush()).toEqual(['{"a":1}']);
    });

    it("empties the buffer, so a second flush says nothing", () => {
      const d = new SseDecoder();
      d.push('data: {"a":1}');
      d.flush();
      expect(d.flush()).toEqual([]);
    });

    it("ignores a trailing fragment that is not a data line", () => {
      const d = new SseDecoder();
      d.push("event: ping");
      expect(d.flush()).toEqual([]);
    });
  });

  /*
   * A whole answer, delivered the way a socket delivers one: in pieces that
   * ignore every boundary in the protocol. The assertion is on the reassembled
   * text, because that is what the reader sees.
   */
  it("reassembles a full answer chopped at random offsets", () => {
    const frames = ["Hel", "lo, ", "how ", "can ", "I ", "help", "?"];
    const wire =
      frames.map((t) => `data: ${JSON.stringify({ text: t })}\n\n`).join("") + "data: [DONE]\n\n";

    const d = new SseDecoder();
    const payloads: string[] = [];
    for (let i = 0; i < wire.length; i += 7) payloads.push(...d.push(wire.slice(i, i + 7)));
    payloads.push(...d.flush());

    const text = payloads
      .map((p) => parseJsonFrame<{ text: string }>(p))
      .filter((f): f is { text: string } => f !== null)
      .map((f) => f.text)
      .join("");

    expect(text).toBe("Hello, how can I help?");
  });
});

describe("parseJsonFrame", () => {
  it("parses an object", () => {
    expect(parseJsonFrame<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("answers nothing for the terminator and for blanks", () => {
    expect(parseJsonFrame("[DONE]")).toBeNull();
    expect(parseJsonFrame("")).toBeNull();
  });

  /*
   * A frame this application does not model must not abandon an answer that is
   * arriving correctly — providers add event types without asking.
   */
  it("skips an unparseable frame instead of throwing", () => {
    expect(parseJsonFrame("not json at all")).toBeNull();
    expect(parseJsonFrame("{oops")).toBeNull();
  });
});

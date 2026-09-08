/**
 * Reassembling `text/event-stream` payloads that arrive in arbitrary pieces.
 *
 * Two of the three assistant providers stream over SSE, and the network does
 * not respect line boundaries: a single JSON object routinely arrives as
 * `{"delta":{"te` in one chunk and `xt":"hello"}}\n\n` in the next. Splitting
 * each chunk on newlines and parsing what you find works perfectly against a
 * local mock and drops tokens against a real connection, intermittently, in
 * proportion to how far away the server is.
 *
 * That is why this is its own module with its own tests. It is the piece most
 * likely to be written the easy way, and the failure it produces — occasional
 * missing words in an answer — looks like the model being odd rather than like
 * a parsing bug.
 */

/**
 * Holds the tail of the last chunk until the rest of its line arrives.
 *
 * Stateful on purpose: the whole point is that a caller can push whatever the
 * socket gives it and get back only complete payloads.
 */
export class SseDecoder {
  private buffer = "";

  /**
   * Feeds one chunk and returns the `data:` payloads completed by it.
   *
   * The terminator `[DONE]` — OpenAI's — is passed through rather than
   * swallowed, so the caller decides what it means. A parser that quietly ate
   * it would leave a caller unable to tell a finished stream from a dropped
   * one.
   */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const out: string[] = [];

    // A line is complete once its terminator has arrived. Everything after the
    // last terminator stays in the buffer, however much of a line it is.
    let index: number;
    while ((index = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);

      if (!line || line.startsWith(":")) continue; // blank, or a comment/keep-alive
      if (!line.startsWith("data:")) continue; // `event:` and `id:` are not ours

      out.push(line.slice(5).trim());
    }

    return out;
  }

  /**
   * Anything left when the stream ends.
   *
   * A well-behaved server ends on a newline and this returns nothing. A server
   * that closes mid-line has given us a truncated payload, and handing it back
   * lets the caller try it rather than silently losing the last thing said.
   */
  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    if (!rest.startsWith("data:")) return [];
    return [rest.slice(5).trim()];
  }
}

/**
 * `JSON.parse`, or nothing.
 *
 * A stream carries frames this application does not model — new event types,
 * provider-specific keepalives, `[DONE]` — and throwing on one of those would
 * abandon an answer that was arriving correctly. An unparseable frame is
 * skipped; a broken *stream* shows up as no text at all, which the caller can
 * see.
 */
export function parseJsonFrame<T>(payload: string): T | null {
  if (!payload || payload === "[DONE]") return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

import { describe, expect, it } from "vitest";

import { invitationIsFor } from "@/lib/invitations";

/**
 * An invitation names one mailbox. Anyone can end up holding the link — mail
 * gets forwarded, screenshots get pasted into group chats — so the address is
 * the thing that decides, not possession of the token.
 */
describe("invitationIsFor", () => {
  it("accepts the mailbox the invitation was addressed to", () => {
    expect(invitationIsFor("teammate@example.com", "teammate@example.com")).toBe(true);
  });

  it("ignores case, because mail addresses are not case sensitive in practice", () => {
    expect(invitationIsFor("Teammate@Example.com", "teammate@example.COM")).toBe(true);
  });

  it("ignores surrounding whitespace, which survives copy and paste", () => {
    expect(invitationIsFor("  teammate@example.com ", "teammate@example.com")).toBe(true);
  });

  it("rejects a different mailbox holding the same link", () => {
    expect(invitationIsFor("teammate@example.com", "someone.else@example.com")).toBe(false);
  });

  it("rejects a plus alias of the invited address", () => {
    // Deliberately strict: `a+x@` is a different address, and treating aliases
    // as equivalent would let one mailbox claim invitations sent to another.
    expect(invitationIsFor("teammate@example.com", "teammate+work@example.com")).toBe(false);
  });

  it("rejects when either side is missing rather than matching loosely", () => {
    expect(invitationIsFor("teammate@example.com", "")).toBe(false);
    expect(invitationIsFor("", "teammate@example.com")).toBe(false);
    expect(invitationIsFor("teammate@example.com", undefined)).toBe(false);
    expect(invitationIsFor(undefined, "teammate@example.com")).toBe(false);
  });

  it("does not treat two blanks as a match", () => {
    expect(invitationIsFor("", "")).toBe(false);
    expect(invitationIsFor("   ", "  ")).toBe(false);
  });
});

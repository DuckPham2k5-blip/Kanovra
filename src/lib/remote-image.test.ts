import { describe, expect, it } from "vitest";

import { isPrivateAddress } from "@/lib/remote-image";

/**
 * The gate in front of a server-side fetch to an address a visitor chose.
 *
 * Getting this wrong turns the banner field into a way to ask the server what
 * it can reach that the visitor cannot — cloud metadata, an internal database,
 * an admin panel bound to loopback. Every case below is an address that must
 * never be fetched.
 */
describe("isPrivateAddress", () => {
  it("refuses loopback", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("127.9.9.9")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
  });

  it("refuses the cloud metadata address", () => {
    // 169.254.169.254 is where AWS, GCP and Azure hand out instance
    // credentials to anything that asks from inside the machine.
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
  });

  it("refuses the private IPv4 blocks", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("192.168.1.1")).toBe(true);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("172.31.255.255")).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
  });

  it("allows the public addresses either side of the 172.16/12 block", () => {
    // The boundary is the part that gets written wrong: 172.15 and 172.32 are
    // ordinary public space and must not be caught by the range check.
    expect(isPrivateAddress("172.15.0.1")).toBe(false);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
  });

  it("refuses IPv6 link-local and unique-local", () => {
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("fc00::1")).toBe(true);
  });

  it("sees through an IPv4 address wearing an IPv6 coat", () => {
    // ::ffff:169.254.169.254 reaches the same metadata endpoint.
    expect(isPrivateAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:93.184.216.34")).toBe(false);
  });

  it("allows ordinary public addresses", () => {
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });

  it("refuses anything that is not an address, rather than guessing", () => {
    expect(isPrivateAddress("localhost")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});

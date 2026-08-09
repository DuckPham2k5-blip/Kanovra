import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Attachment storage is the one place in the app that turns request data into
 * filesystem paths, so these tests focus on the two ways that goes wrong:
 * a filename that escapes the upload directory, and a filename that escapes
 * the Content-Disposition header.
 *
 * `UPLOAD_DIR` is read when the module is first evaluated, so it is set before
 * the dynamic import below rather than at the top of the file.
 */

let dir: string;
let storage: typeof import("./storage");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "kanovra-uploads-"));
  process.env.UPLOAD_DIR = dir;
  storage = await import("./storage");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("cleanFilename()", () => {
  it("keeps names people actually use", async () => {
    const { cleanFilename } = storage;
    expect(cleanFilename("bao cao - quy 4.pdf")).toBe("bao cao - quy 4.pdf");
    expect(cleanFilename("kế hoạch marketing.docx")).toBe("kế hoạch marketing.docx");
    expect(cleanFilename("Screenshot 2026-08-09 at 10.42.11.png")).toBe(
      "Screenshot 2026-08-09 at 10.42.11.png",
    );
  });

  it("strips any directory the browser sent", async () => {
    const { cleanFilename } = storage;
    expect(cleanFilename("C:\\Users\\PC\\secret.txt")).toBe("secret.txt");
    expect(cleanFilename("../../etc/passwd")).toBe("passwd");
    expect(cleanFilename("nested/dir/report.pdf")).toBe("report.pdf");
  });

  it("removes characters that would break the download header", async () => {
    const { cleanFilename } = storage;
    // A quote would end the filename token early; control characters would
    // terminate or inject a header line.
    expect(cleanFilename('inv"oice.pdf')).toBe("invoice.pdf");
    expect(cleanFilename("a\u0000b\u001fc.txt")).toBe("abc.txt");
    expect(cleanFilename("dro\u007fp.txt")).toBe("drop.txt");
  });

  it("always yields a non-empty, bounded name", async () => {
    const { cleanFilename } = storage;
    expect(cleanFilename("///")).toBe("file");
    expect(cleanFilename("   ")).toBe("file");
    expect(cleanFilename("a".repeat(500))).toHaveLength(200);
  });
});

describe("saveAttachment() / readAttachment()", () => {
  it("round-trips bytes under a generated id", async () => {
    const { saveAttachment, readAttachment } = storage;
    const id = "3f0c1a2b-4d5e-6f70-8912-abcdef012345";
    await saveAttachment(id, Buffer.from("hello attachment"));

    const stored = await readFile(path.join(dir, id));
    expect(stored.toString()).toBe("hello attachment");

    const opened = await readAttachment(id);
    expect(opened?.size).toBe(16);
    opened?.stream.destroy();
  });

  it("returns null for an id that was never stored", async () => {
    expect(await storage.readAttachment("does-not-exist")).toBeNull();
  });

  it("refuses to write outside the upload directory", async () => {
    const { saveAttachment } = storage;
    // Nothing should ever pass these in — ids are generated — but this is the
    // last line of defence if that ever stops being true.
    for (const escape of ["../escaped", "..\\escaped", "a/../../b", "sub/dir", "/etc/passwd"]) {
      await expect(
        saveAttachment(escape, Buffer.from("x")),
        `${escape} must be rejected`,
      ).rejects.toThrow();
    }
  });
});

describe("isInlineSafe()", () => {
  it("allows only formats that cannot execute script", async () => {
    const { isInlineSafe } = storage;
    for (const ok of ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]) {
      expect(isInlineSafe(ok), ok).toBe(true);
    }
    // SVG and HTML render script; served inline from our origin that is stored XSS.
    for (const bad of ["image/svg+xml", "text/html", "application/xhtml+xml", null, undefined, ""]) {
      expect(isInlineSafe(bad), String(bad)).toBe(false);
    }
  });
});

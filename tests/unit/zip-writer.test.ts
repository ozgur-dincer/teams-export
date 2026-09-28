import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { crc32, buildZip } from "../../src/zip-writer.js";

describe("crc32", () => {
  it("matches the standard CRC-32 check value for '123456789'", () => {
    const data = new TextEncoder().encode("123456789");
    assert.equal(crc32(data), 0xcbf43926);
  });

  it("returns 0 for empty input", () => {
    assert.equal(crc32(new Uint8Array()), 0);
  });
});

describe("buildZip", () => {
  it("produces a Blob with the application/zip MIME type", () => {
    const zip = buildZip([{ name: "hello.txt", data: new TextEncoder().encode("hi") }]);
    assert.ok(zip instanceof Blob);
    assert.equal(zip.type, "application/zip");
  });

  it("starts with the local file header signature", async () => {
    const zip = buildZip([{ name: "a.txt", data: new TextEncoder().encode("x") }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    // Local file header signature: 0x04034b50 stored little-endian.
    assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  });

  it("ends with the end-of-central-directory signature", async () => {
    const zip = buildZip([{ name: "a.txt", data: new TextEncoder().encode("x") }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    // End of central directory signature: 0x06054b50 stored little-endian,
    // followed by a fixed-size 18-byte record with no comment.
    const tail = bytes.slice(bytes.length - 22, bytes.length - 18);
    assert.deepEqual(Array.from(tail), [0x50, 0x4b, 0x05, 0x06]);
  });

  it("supports multiple entries", async () => {
    const zip = buildZip([
      { name: "images/image-1.png", data: new Uint8Array([1, 2, 3]) },
      { name: "notes.md", data: new TextEncoder().encode("# Title") }
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    assert.ok(bytes.length > 0);
  });
});

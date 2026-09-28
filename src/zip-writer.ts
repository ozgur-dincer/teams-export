/**
 * Minimal ZIP archive writer (store/no-compression method only).
 *
 * We only need to bundle a handful of already-compressed images (PNG/JPEG/WEBP)
 * alongside a single text file, so skipping DEFLATE keeps this dependency-free
 * and simple while still producing a spec-compliant ZIP that any archive tool
 * (Explorer, 7-Zip, macOS Archive Utility) can open.
 */

export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function writeUint32LE(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ]);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

export function buildZip(entries: ZipEntryInput[]): Blob {
  const encoder = new TextEncoder();
  const fileParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = concatBytes(
      writeUint32LE(0x04034b50),
      writeUint16LE(20), // version needed to extract
      writeUint16LE(0), // general purpose flag
      writeUint16LE(0), // compression method: store
      writeUint16LE(0), // last mod file time
      writeUint16LE(0), // last mod file date
      writeUint32LE(crc),
      writeUint32LE(size), // compressed size
      writeUint32LE(size), // uncompressed size
      writeUint16LE(nameBytes.length),
      writeUint16LE(0) // extra field length
    );

    fileParts.push(localHeader, nameBytes, entry.data);

    const centralHeader = concatBytes(
      writeUint32LE(0x02014b50),
      writeUint16LE(20), // version made by
      writeUint16LE(20), // version needed to extract
      writeUint16LE(0), // general purpose flag
      writeUint16LE(0), // compression method: store
      writeUint16LE(0), // last mod file time
      writeUint16LE(0), // last mod file date
      writeUint32LE(crc),
      writeUint32LE(size),
      writeUint32LE(size),
      writeUint16LE(nameBytes.length),
      writeUint16LE(0), // extra field length
      writeUint16LE(0), // file comment length
      writeUint16LE(0), // disk number start
      writeUint16LE(0), // internal file attributes
      writeUint32LE(0), // external file attributes
      writeUint32LE(offset) // relative offset of local header
    );

    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + entry.data.length;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);

  const endRecord = concatBytes(
    writeUint32LE(0x06054b50),
    writeUint16LE(0), // disk number
    writeUint16LE(0), // disk where central directory starts
    writeUint16LE(entries.length), // central directory records on this disk
    writeUint16LE(entries.length), // total central directory records
    writeUint32LE(centralDirectorySize),
    writeUint32LE(centralDirectoryOffset),
    writeUint16LE(0) // comment length
  );

  return new Blob([...fileParts, ...centralParts, endRecord] as BlobPart[], { type: "application/zip" });
}

/** Minimal image sniffing: detect type from magic bytes and read dimensions. */
export interface ImageInfo {
  mime: string;
  width?: number;
  height?: number;
}

export function sniffImage(b: Buffer): ImageInfo | null {
  if (b.length < 12) return null;
  // PNG
  if (b.readUInt32BE(0) === 0x89504e47) {
    return { mime: "image/png", width: b.length >= 24 ? b.readUInt32BE(16) : undefined, height: b.length >= 24 ? b.readUInt32BE(20) : undefined };
  }
  // GIF
  if (b.toString("ascii", 0, 3) === "GIF") return { mime: "image/gif", width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  // WEBP
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const info: ImageInfo = { mime: "image/webp" };
    const chunk = b.toString("ascii", 12, 16);
    try {
      if (chunk === "VP8 ") {
        info.width = b.readUInt16LE(26) & 0x3fff;
        info.height = b.readUInt16LE(28) & 0x3fff;
      } else if (chunk === "VP8L") {
        const bits = b.readUInt32LE(21);
        info.width = (bits & 0x3fff) + 1;
        info.height = ((bits >> 14) & 0x3fff) + 1;
      } else if (chunk === "VP8X") {
        info.width = 1 + b.readUIntLE(24, 3);
        info.height = 1 + b.readUIntLE(27, 3);
      }
    } catch {
      /* dimensions optional */
    }
    return info;
  }
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8) {
    const info: ImageInfo = { mime: "image/jpeg" };
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        info.height = b.readUInt16BE(i + 5);
        info.width = b.readUInt16BE(i + 7);
        break;
      }
      i += 2 + len;
    }
    return info;
  }
  // AVIF / HEIC (ftyp box) — accept without dimensions
  if (b.toString("ascii", 4, 8) === "ftyp") {
    const brand = b.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return { mime: "image/avif" };
  }
  return null;
}

import { sniffImage, type ImageInfo } from "./image.js";

export interface UploadInfo extends ImageInfo {
  kind: "image" | "file";
}

/** MIME types accepted for direct (presigned) uploads, mapped from extension. */
const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const ALLOWED = new Set(Object.values(EXT_MIME));
const ZIP_MIMES = new Set([
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function extensionOf(name: string | undefined | null): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name ?? "");
  return m ? m[1].toLowerCase() : "";
}

/** Resolve a declared MIME + filename to an allowed type (or null). */
export function mimeForUpload(declared: unknown, name: unknown): string | null {
  const ext = extensionOf(typeof name === "string" ? name : "");
  const byExt = ext ? EXT_MIME[ext] : undefined;
  const d = typeof declared === "string" ? declared.toLowerCase().split(";")[0].trim() : "";
  if (d === "image/jpg") return "image/jpeg";
  if (ALLOWED.has(d)) return d;
  return byExt ?? null;
}

export const isImageMime = (mime: string) => mime.startsWith("image/");

function looksLikeText(b: Buffer): boolean {
  const sample = b.subarray(0, Math.min(b.length, 4096));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate bytes against their claimed type. Never trusts the client MIME:
 * the returned MIME is derived from magic bytes (or a matching extension for
 * ZIP-based office files).
 */
export function sniffUpload(b: Buffer, declared: string, name?: string | null): UploadInfo | null {
  const img = sniffImage(b);
  if (img) return { ...img, kind: "image" };

  // PDF
  if (b.subarray(0, 5).toString("ascii") === "%PDF-") return { kind: "file", mime: "application/pdf" };

  // ZIP and OOXML (docx/xlsx/pptx are ZIP containers)
  const zipMagic =
    b.subarray(0, 4).toString("binary") === "PK\x03\x04" ||
    b.subarray(0, 4).toString("binary") === "PK\x05\x06" ||
    b.subarray(0, 4).toString("binary") === "PK\x07\x08";
  if (zipMagic) {
    const ext = extensionOf(name);
    const byExt = ext ? EXT_MIME[ext] : undefined;
    const mime = byExt && ZIP_MIMES.has(byExt) ? byExt : "application/zip";
    return { kind: "file", mime };
  }

  // Plain text-ish documents
  if (looksLikeText(b)) {
    const ext = extensionOf(name);
    const byExt = ext ? EXT_MIME[ext] : undefined;
    if (byExt && byExt.startsWith("text/")) return { kind: "file", mime: byExt };
    if (byExt === "application/json") return { kind: "file", mime: byExt };
    if (declared.startsWith("text/")) return { kind: "file", mime: "text/plain" };
  }
  return null;
}

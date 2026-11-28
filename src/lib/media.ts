import type { Attachment } from "@shared";
import { API_URL, resolveApiUrl } from "../config";
import { getToken } from "../stores/session";

export function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Upload with progress via XHR (fetch has no upload progress). */
export function uploadAttachment(file: File, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/v1/attachments`);
    const t = getToken();
    if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const att = JSON.parse(xhr.responseText) as Attachment;
          if (!att.width) {
            const dims = await imageSize(file);
            if (dims) Object.assign(att, dims);
          }
          resolve({ name: file.name, ...att });
        } catch {
          reject(new Error("Upload response was not understood"));
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          msg = JSON.parse(xhr.responseText).message ?? msg;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    signal?.addEventListener("abort", () => xhr.abort());
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

const blobCache = new Map<string, Promise<string>>();
/** Fetch a protected API asset with the bearer token and return an object URL. */
export function authedObjectUrl(path: string): Promise<string> {
  const url = resolveApiUrl(path)!;
  let p = blobCache.get(url);
  if (!p) {
    p = fetch(url, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} }).then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      return URL.createObjectURL(await r.blob());
    });
    p.catch(() => blobCache.delete(url));
    blobCache.set(url, p);
  }
  return p;
}

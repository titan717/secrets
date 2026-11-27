import { useEffect, useState } from "react";
import { File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo } from "lucide-react";
import type { VaultItem } from "@secrets/shared";
import { authedObjectUrl } from "../../lib/media";

export type Kind = "image" | "video" | "audio" | "pdf" | "text" | "other";
export function kindOf(mime: string, name = ""): Kind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/") || /json|xml|javascript|yaml|markdown/.test(mime) || /\.(md|txt|csv|json|log|ya?ml|ts|js|py)$/i.test(name)) return "text";
  return "other";
}

export function FileIcon({ item, size = 22 }: { item: VaultItem; size?: number }) {
  const k = kindOf(item.mime, item.name);
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  if (k === "image") return <FileImage size={size} />;
  if (k === "video") return <FileVideo size={size} />;
  if (k === "audio") return <FileAudio size={size} />;
  if (k === "pdf") return <FileText size={size} />;
  if (/^(zip|rar|7z|tar|gz)$/.test(ext)) return <FileArchive size={size} />;
  if (/^(xls|xlsx|csv|numbers)$/.test(ext)) return <FileSpreadsheet size={size} />;
  if (k === "text") return <FileCode size={size} />;
  return <File size={size} />;
}

export const fileUrl = (item: VaultItem) => `${item.url}?inline=1`;

/** Object URL for a vault file (bearer-authenticated, cached). */
export function useVaultUrl(item: VaultItem | null, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!item || !enabled) return;
    let live = true;
    authedObjectUrl(fileUrl(item)).then(
      (u) => live && setUrl(u),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [item?.id, item?.updated_at, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { url, failed };
}

export async function downloadItem(item: VaultItem) {
  const u = await authedObjectUrl(fileUrl(item));
  const a = document.createElement("a");
  a.href = u;
  a.download = item.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const typeLabel = (item: VaultItem) => {
  const ext = item.name.includes(".") ? item.name.split(".").pop()!.toUpperCase() : "";
  return ext && ext.length <= 5 ? ext : item.mime.split("/")[1]?.toUpperCase().slice(0, 8) || "FILE";
};

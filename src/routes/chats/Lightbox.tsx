import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { Attachment } from "@shared";
import { resolveApiUrl } from "../../config";
import { AuthImage, IconButton } from "../../ui";

export function Lightbox({ items, index, onIndex, onClose }: { items: Attachment[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(Math.min(items.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [index, items.length, onClose, onIndex]);
  const a = items[index];
  if (!a) return null;
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer" onClick={onClose}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="faint">{items.length > 1 ? `${index + 1} of ${items.length}` : a.name ?? "Photo"}</span>
        <div className="row">
          <a className="icon-btn icon-btn-md icon-btn-ghost" href={resolveApiUrl(a.url)} download={a.name ?? true} target="_blank" rel="noreferrer" aria-label="Download">
            <Download size={18} />
          </a>
          <IconButton label="Close" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
      </div>
      {index > 0 && (
        <button className="lightbox-nav is-prev" aria-label="Previous" onClick={(e) => (e.stopPropagation(), onIndex(index - 1))}>
          <ChevronLeft size={26} />
        </button>
      )}
      <AuthImage path={a.url} alt={a.name ?? ""} className="lightbox-img" onClick={(e) => e.stopPropagation()} />
      {index < items.length - 1 && (
        <button className="lightbox-nav is-next" aria-label="Next" onClick={(e) => (e.stopPropagation(), onIndex(index + 1))}>
          <ChevronRight size={26} />
        </button>
      )}
    </div>,
    document.body,
  );
}

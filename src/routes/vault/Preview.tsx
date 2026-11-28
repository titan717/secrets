import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Pencil, Trash2, X } from "lucide-react";
import type { VaultItem } from "@shared";
import { Button, IconButton, Spinner } from "../../ui";
import { formatBytes } from "../../lib/features/api";
import { FileIcon, kindOf, typeLabel, useVaultUrl } from "./util";

export function Preview({
  item,
  onClose,
  onPrev,
  onNext,
  onDownload,
  onDelete,
  onRename,
}: {
  item: VaultItem;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const kind = kindOf(item.mime, item.name);
  const previewable = kind !== "other" && !(kind === "text" && item.size > 1_000_000);
  const { url, failed } = useVaultUrl(item, previewable);
  const [text, setText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);

  useEffect(() => {
    setName(item.name);
    setEditing(false);
  }, [item.id, item.name]);
  useEffect(() => {
    setText(null);
    if (kind !== "text" || !url) return;
    let live = true;
    void fetch(url)
      .then((r) => r.text())
      .then((t) => live && setText(t));
    return () => {
      live = false;
    };
  }, [url, kind]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, editing]);

  const commit = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== item.name) onRename(name.trim());
    else setName(item.name);
  };

  let body: React.ReactNode;
  if (!previewable || failed)
    body = (
      <div className="vp-none">
        <span className="vp-none-ico">
          <FileIcon item={item} size={40} />
        </span>
        <p className="muted">{failed ? "Couldn't load a preview." : "No preview for this file type."}</p>
        <Button icon={<Download size={16} />} onClick={onDownload}>
          Download
        </Button>
      </div>
    );
  else if (!url) body = <Spinner size={28} />;
  else if (kind === "image") body = <img className="vp-img" src={url} alt={item.name} />;
  else if (kind === "video") body = <video className="vp-media" src={url} controls autoPlay playsInline />;
  else if (kind === "audio")
    body = (
      <div className="vp-audio">
        <span className="vp-none-ico">
          <FileIcon item={item} size={40} />
        </span>
        <audio src={url} controls autoPlay />
      </div>
    );
  else if (kind === "pdf") body = <iframe className="vp-pdf" src={url} title={item.name} />;
  else body = text === null ? <Spinner size={28} /> : <pre className="vp-text">{text}</pre>;

  return createPortal(
    <div className="vp" role="dialog" aria-modal="true" aria-label={item.name}>
      <header className="vp-head">
        <span className="vp-ico">
          <FileIcon item={item} size={18} />
        </span>
        <div className="grow">
          {editing ? (
            <input
              className="vp-name-input"
              value={name}
              autoFocus
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setName(item.name);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button className="vp-name truncate" onClick={() => setEditing(true)} title="Rename">
              {item.name}
            </button>
          )}
          <div className="vp-sub">
            {typeLabel(item)} · {formatBytes(item.size)} · Added {new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <IconButton label="Rename" onClick={() => setEditing(true)} className="vp-btn">
          <Pencil size={17} />
        </IconButton>
        <IconButton label="Download" onClick={onDownload} className="vp-btn">
          <Download size={18} />
        </IconButton>
        <IconButton label="Delete" onClick={onDelete} className="vp-btn">
          <Trash2 size={17} />
        </IconButton>
        <IconButton label="Close" onClick={onClose} className="vp-btn">
          <X size={20} />
        </IconButton>
      </header>
      <div className="vp-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {onPrev && (
          <IconButton label="Previous file" variant="soft" className="vp-nav vp-nav-l" onClick={onPrev}>
            <ChevronLeft size={20} />
          </IconButton>
        )}
        {body}
        {onNext && (
          <IconButton label="Next file" variant="soft" className="vp-nav vp-nav-r" onClick={onNext}>
            <ChevronRight size={20} />
          </IconButton>
        )}
      </div>
    </div>,
    document.body,
  );
}

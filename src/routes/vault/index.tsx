import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudUpload, Download, LayoutGrid, List as ListIcon, Lock, MoreVertical, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import type { VaultItem, VaultUsage } from "@shared";
import { Button, EmptyState, IconButton, Spinner, Tabs } from "../../ui";
import { PageHeader } from "../PageHeader";
import { formatBytes, vaultApi } from "../../lib/features/api";
import { useConfirm } from "../../lib/features/Confirm";
import { errorMessage } from "../../lib/api";
import { toast } from "../../stores/toast";
import { FileIcon, downloadItem, kindOf, typeLabel, useVaultUrl } from "./util";
import { Preview } from "./Preview";
import "./vault.css";

type TypeFilter = "all" | "image" | "video" | "audio" | "pdf" | "other";
type Sort = "newest" | "name" | "size";
interface Upload { id: string; name: string; size: number; progress: number; error?: string; ctrl: AbortController }

const VIEW_KEY = "secrets.vault.view";

function Thumb({ item }: { item: VaultItem }) {
  const isImg = kindOf(item.mime) === "image";
  const { url, failed } = useVaultUrl(item, isImg);
  if (isImg && url && !failed) return <img src={url} alt="" className="vt-img" draggable={false} />;
  return (
    <span className={`vt-ph vt-${kindOf(item.mime, item.name)}`}>
      <FileIcon item={item} size={30} />
      <span className="vt-ext">{typeLabel(item)}</span>
    </span>
  );
}

export default function VaultPage() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [usage, setUsage] = useState<VaultUsage | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [view, setViewState] = useState<"grid" | "list">(() => (localStorage.getItem(VIEW_KEY) as "grid" | "list") || "grid");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const { confirm, dialog } = useConfirm();

  const setView = (v: "grid" | "list") => {
    setViewState(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  const load = useCallback(async () => {
    try {
      const [list, u] = await Promise.all([vaultApi.list(), vaultApi.usage()]);
      setItems(list);
      setUsage(u);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const refreshUsage = () => void vaultApi.usage().then(setUsage, () => undefined);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = items.filter((i) => {
      const k = kindOf(i.mime, i.name);
      if (type !== "all" && (type === "other" ? !(k === "other" || k === "text") : k !== type)) return false;
      return !t || i.name.toLowerCase().includes(t);
    });
    list = [...list].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "size" ? b.size - a.size : b.created_at.localeCompare(a.created_at)));
    return list;
  }, [items, type, q, sort]);
  const counts = useMemo(() => {
    const c: Record<TypeFilter, number> = { all: items.length, image: 0, video: 0, audio: 0, pdf: 0, other: 0 };
    for (const i of items) {
      const k = kindOf(i.mime, i.name);
      c[k === "text" ? "other" : k]++;
    }
    return c;
  }, [items]);

  const upload = (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    const max = usage?.max_file_bytes ?? 25 * 1024 * 1024;
    let free = usage ? usage.quota_bytes - usage.used_bytes : Infinity;
    for (const f of list) {
      if (f.size > max) {
        toast.error(`${f.name} is larger than ${formatBytes(max)}`);
        continue;
      }
      if (f.size > free) {
        toast.error(`Not enough space for ${f.name}`);
        continue;
      }
      free -= f.size;
      const u: Upload = { id: crypto.randomUUID(), name: f.name, size: f.size, progress: 0, ctrl: new AbortController() };
      setUploads((us) => [...us, u]);
      vaultApi
        .upload(f, (p) => setUploads((us) => us.map((x) => (x.id === u.id ? { ...x, progress: p } : x))), u.ctrl.signal)
        .then((item) => {
          setItems((is) => [item, ...is]);
          setUploads((us) => us.filter((x) => x.id !== u.id));
          refreshUsage();
        })
        .catch((e) => {
          if (e?.name === "AbortError") setUploads((us) => us.filter((x) => x.id !== u.id));
          else setUploads((us) => us.map((x) => (x.id === u.id ? { ...x, error: errorMessage(e) } : x)));
        });
    }
  };

  const remove = async (item: VaultItem) => {
    setMenu(null);
    if (!(await confirm(`Delete “${item.name}”?`, { body: "This file will be permanently removed from your Vault." }))) return;
    try {
      await vaultApi.remove(item.id);
      setItems((is) => is.filter((i) => i.id !== item.id));
      if (previewId === item.id) setPreviewId(null);
      refreshUsage();
      toast.success("File deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const rename = async (item: VaultItem, name: string) => {
    setRenaming(null);
    if (!name.trim() || name.trim() === item.name) return;
    try {
      const n = await vaultApi.rename(item.id, name.trim());
      setItems((is) => is.map((i) => (i.id === n.id ? n : i)));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const download = (item: VaultItem) => {
    setMenu(null);
    downloadItem(item).catch((e) => toast.error(errorMessage(e)));
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const pIndex = previewId ? shown.findIndex((i) => i.id === previewId) : -1;
  const pItem = pIndex >= 0 ? shown[pIndex] : null;
  const pct = usage ? Math.min(100, (usage.used_bytes / usage.quota_bytes) * 100) : 0;

  const renderActions = (item: VaultItem) => (
    <div className="vi-menu-wrap" onClick={(e) => e.stopPropagation()}>
      <IconButton size="sm" label="File actions" className="vi-more" active={menu === item.id} onClick={() => setMenu(menu === item.id ? null : item.id)}>
        <MoreVertical size={16} />
      </IconButton>
      {menu === item.id && (
        <div className="vi-menu" role="menu">
          <button role="menuitem" onClick={() => download(item)}>
            <Download size={15} /> Download
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              setRenaming({ id: item.id, name: item.name });
            }}
          >
            <Pencil size={15} /> Rename
          </button>
          <button role="menuitem" className="is-danger" onClick={() => void remove(item)}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      )}
    </div>
  );
  const renderName = (item: VaultItem) =>
    renaming?.id === item.id ? (
      <input
        className="vi-rename"
        autoFocus
        value={renaming.name}
        maxLength={200}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setRenaming({ id: item.id, name: e.target.value })}
        onBlur={() => void rename(item, renaming.name)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void rename(item, renaming.name);
          if (e.key === "Escape") setRenaming(null);
        }}
      />
    ) : (
      <span className="vi-name truncate" title={item.name}>
        {item.name}
      </span>
    );

  return (
    <div
      className="page vault-page"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        upload(e.dataTransfer.files);
      }}
    >
      <PageHeader
        title="Vault"
        subtitle="Private storage for your files"
        actions={
          <Button size="sm" icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
            Upload
          </Button>
        }
      />
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => (e.target.files && upload(e.target.files), (e.target.value = ""))} />
      <div className="page-body vault-body">
        <section className="vu" aria-label="Storage usage">
          <div className="vu-top">
            <span className="vu-ico">
              <Lock size={18} />
            </span>
            <div className="grow">
              <div className="vu-title">
                {usage ? (
                  <>
                    <strong>{formatBytes(usage.used_bytes)}</strong> <span className="faint">of {formatBytes(usage.quota_bytes)} used</span>
                  </>
                ) : (
                  "Storage"
                )}
              </div>
              <div className="vu-sub">
                {usage ? `${usage.item_count} ${usage.item_count === 1 ? "file" : "files"} · up to ${formatBytes(usage.max_file_bytes)} each` : "Loading…"}
              </div>
            </div>
            <span className="vu-pct">{usage ? `${Math.round(pct)}%` : ""}</span>
          </div>
          <div className={`vu-bar ${pct > 90 ? "is-full" : pct > 75 ? "is-warn" : ""}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.max(pct, usage?.used_bytes ? 1.5 : 0)}%` }} />
          </div>
        </section>

        {uploads.length > 0 && (
          <ul className="vq" aria-label="Uploads">
            {uploads.map((u) => (
              <li key={u.id} className={u.error ? "is-error" : ""}>
                <CloudUpload size={16} />
                <span className="grow truncate">{u.name}</span>
                <span className="vq-meta">{u.error ?? `${Math.round(u.progress * 100)}% of ${formatBytes(u.size)}`}</span>
                <span className="vq-bar">
                  <span style={{ width: `${u.progress * 100}%` }} />
                </span>
                <IconButton size="sm" label={u.error ? "Dismiss" : "Cancel upload"} onClick={() => (u.error ? setUploads((us) => us.filter((x) => x.id !== u.id)) : u.ctrl.abort())}>
                  <X size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <div className="vbar">
          <label className="input-wrap input-box vsearch">
            <Search size={16} className="input-adorn" />
            <input className="input" placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search files" />
          </label>
          <select className="select vsort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
            <option value="newest">Newest</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
          <div className="vview" role="group" aria-label="View">
            <IconButton size="sm" label="Grid view" active={view === "grid"} onClick={() => setView("grid")}>
              <LayoutGrid size={16} />
            </IconButton>
            <IconButton size="sm" label="List view" active={view === "list"} onClick={() => setView("list")}>
              <ListIcon size={16} />
            </IconButton>
          </div>
        </div>
        <Tabs<TypeFilter>
          className="vtabs"
          value={type}
          onChange={setType}
          items={[
            { id: "all", label: "All", count: counts.all },
            { id: "image", label: "Photos", count: counts.image },
            { id: "video", label: "Videos", count: counts.video },
            { id: "audio", label: "Audio", count: counts.audio },
            { id: "pdf", label: "PDFs", count: counts.pdf },
            { id: "other", label: "Other", count: counts.other },
          ]}
        />

        {!loaded ? (
          <div className="page-loading">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState compact title="Couldn't open your Vault" body={error} action={<Button variant="secondary" onClick={() => void load()}>Try again</Button>} />
        ) : items.length === 0 ? (
          <button className="vdrop" onClick={() => fileRef.current?.click()}>
            <span className="vdrop-ico">
              <CloudUpload size={30} />
            </span>
            <strong>Drop files here or click to upload</strong>
            <span className="faint">Photos, videos, PDFs and documents · up to {formatBytes(usage?.max_file_bytes ?? 25 * 1024 * 1024)} each</span>
          </button>
        ) : shown.length === 0 ? (
          <EmptyState compact title="No matching files" body="Try another filter or search term." />
        ) : view === "grid" ? (
          <ul className="vgrid">
            {shown.map((item) => (
              <li key={item.id} className="vi">
                <button className="vi-thumb" onClick={() => setPreviewId(item.id)} aria-label={`Open ${item.name}`}>
                  <Thumb item={item} />
                </button>
                <div className="vi-foot">
                  <div className="grow">
                    {renderName(item)}
                    <span className="vi-sub">{formatBytes(item.size)}</span>
                  </div>
                  {renderActions(item)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="vlist">
            {shown.map((item) => (
              <li key={item.id} className="vl" onClick={() => renaming?.id !== item.id && setPreviewId(item.id)}>
                <span className={`vl-ico vt-${kindOf(item.mime, item.name)}`}>
                  <FileIcon item={item} size={18} />
                </span>
                <span className="grow vl-main">
                  {renderName(item)}
                  <span className="vi-sub">
                    {typeLabel(item)} · {formatBytes(item.size)}
                  </span>
                </span>
                <span className="vl-date faint">{new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                <IconButton
                  size="sm"
                  label="Download"
                  className="vl-dl"
                  onClick={(e) => {
                    e.stopPropagation();
                    download(item);
                  }}
                >
                  <Download size={16} />
                </IconButton>
                {renderActions(item)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {dragging && (
        <div className="vdrag" aria-hidden>
          <div className="vdrag-card">
            <CloudUpload size={36} />
            <strong>Drop to upload to your Vault</strong>
          </div>
        </div>
      )}
      {pItem && (
        <Preview
          item={pItem}
          onClose={() => setPreviewId(null)}
          onPrev={pIndex > 0 ? () => setPreviewId(shown[pIndex - 1].id) : undefined}
          onNext={pIndex < shown.length - 1 ? () => setPreviewId(shown[pIndex + 1].id) : undefined}
          onDownload={() => download(pItem)}
          onDelete={() => void remove(pItem)}
          onRename={(n) => void rename(pItem, n)}
        />
      )}
      {dialog}
    </div>
  );
}

export { VaultPage };

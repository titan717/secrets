import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Bold, Check, CheckSquare, Code, Eye, Folder, Heading, ImagePlus, Italic, Link2, List, ListOrdered, MoreHorizontal, PenLine, Pin, Quote, Star, Trash2, X,
} from "lucide-react";
import type { Note, NoteFolder } from "@shared";
import { IconButton, Spinner } from "../../ui";
import { Markdown, toggleCheck, checklistProgress } from "../../lib/features/markdown";
import { notesApi, type NoteInput } from "../../lib/features/api";
import { uploadAttachment } from "../../lib/media";
import { errorMessage } from "../../lib/api";
import { toast } from "../../stores/toast";

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";
const DEBOUNCE = 700;

function editedLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" })}, ${time}`;
}

/** Markdown note editor with debounced autosave, toolbar, checklist toggling, tags, folder, pin & star. */
export function NoteEditor({
  note,
  folders,
  onChange,
  onDelete,
  onBack,
}: {
  note: Note;
  folders: NoteFolder[];
  onChange: (n: Note) => void;
  onDelete: (n: Note) => void;
  onBack?: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags);
  const [mode, setMode] = useState<"write" | "read">(note.body.trim() ? "read" : "write");
  const [save, setSave] = useState<SaveState>("idle");
  const [tagDraft, setTagDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pending = useRef<NoteInput>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setSave("saving");
    try {
      const n = await notesApi.update(noteRef.current.id, patch);
      // Keep local text (user may have typed since); sync metadata.
      changeRef.current({ ...n, ...pending.current } as Note);
      setSave(Object.keys(pending.current).length ? "pending" : "saved");
    } catch (e) {
      pending.current = { ...patch, ...pending.current };
      setSave("error");
      toast.error(errorMessage(e));
    }
  }, []);

  const queue = useCallback(
    (patch: NoteInput, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      changeRef.current({ ...noteRef.current, ...patch, updated_at: new Date().toISOString() } as Note);
      setSave("pending");
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), DEBOUNCE);
    },
    [flush],
  );

  // Flush on note switch / unmount / tab close.
  useEffect(() => {
    const onUnload = () => {
      if (Object.keys(pending.current).length) void flush();
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (save !== "saved") return;
    const t = setTimeout(() => setSave("idle"), 1800);
    return () => clearTimeout(t);
  }, [save]);

  // Keyboard: ⌘S save now, ⌘E toggle preview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        setMode((m) => (m === "write" ? "read" : "write"));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flush]);

  const setBodyAndQueue = (b: string) => {
    setBody(b);
    queue({ body: b });
  };

  /** Wrap selection or prefix lines in the textarea. */
  const apply = (kind: "bold" | "italic" | "code" | "link" | "h" | "ul" | "ol" | "check" | "quote") => {
    if (mode !== "write") setMode("write");
    requestAnimationFrame(() => {
      const el = ta.current;
      if (!el) return;
      const { selectionStart: s, selectionEnd: e, value: v } = el;
      const sel = v.slice(s, e);
      let next = v;
      let ns = s;
      let ne = e;
      const wrap = (l: string, r = l, ph = "text") => {
        const inner = sel || ph;
        next = v.slice(0, s) + l + inner + r + v.slice(e);
        ns = s + l.length;
        ne = ns + inner.length;
      };
      if (kind === "bold") wrap("**");
      else if (kind === "italic") wrap("*");
      else if (kind === "code") wrap("`", "`", "code");
      else if (kind === "link") {
        const inner = sel || "link";
        next = v.slice(0, s) + `[${inner}](https://)` + v.slice(e);
        ns = s + inner.length + 3;
        ne = ns + 8;
      } else {
        const ls = v.lastIndexOf("\n", s - 1) + 1;
        const le = v.indexOf("\n", e) === -1 ? v.length : v.indexOf("\n", e);
        const prefix = { h: "## ", ul: "- ", ol: "1. ", check: "- [ ] ", quote: "> " }[kind];
        const block = v
          .slice(ls, le)
          .split("\n")
          .map((ln, i) => {
            const stripped = ln.replace(/^(\s*)(#{1,3}\s+|[-*+]\s+\[[ xX]\]\s?|[-*+]\s+|\d+[.)]\s+|>\s?)/, "$1");
            const p = kind === "ol" ? `${i + 1}. ` : prefix;
            return ln.startsWith(p) ? stripped : p + stripped;
          })
          .join("\n");
        next = v.slice(0, ls) + block + v.slice(le);
        ns = ls;
        ne = ls + block.length;
      }
      setBodyAndQueue(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(ns, ne);
      });
    });
  };

  /** Continue lists/checklists on Enter; Tab indents. */
  const onBodyKey = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = ev.currentTarget;
    if (ev.key === "Enter" && !ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
      const { selectionStart: s, value: v } = el;
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      const line = v.slice(ls, s);
      const m = line.match(/^(\s*)([-*+]\s+\[[ xX]\]\s|[-*+]\s+|(\d+)[.)]\s+|>\s?)(.*)$/);
      if (!m) return;
      ev.preventDefault();
      if (!m[4].trim()) {
        const nv = v.slice(0, ls) + v.slice(s);
        setBodyAndQueue(nv);
        requestAnimationFrame(() => el.setSelectionRange(ls, ls));
        return;
      }
      let marker = m[2];
      if (/\[[ xX]\]/.test(marker)) marker = marker.replace(/\[[xX]\]/, "[ ]");
      if (m[3]) marker = `${Number(m[3]) + 1}. `;
      const ins = `\n${m[1]}${marker}`;
      const nv = v.slice(0, s) + ins + v.slice(el.selectionEnd);
      setBodyAndQueue(nv);
      requestAnimationFrame(() => el.setSelectionRange(s + ins.length, s + ins.length));
    } else if (ev.key === "Tab") {
      const { selectionStart: s, value: v } = el;
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      if (!/^\s*([-*+]|\d+[.)])\s/.test(v.slice(ls))) return;
      ev.preventDefault();
      if (ev.shiftKey) {
        if (!v.slice(ls).startsWith("  ")) return;
        setBodyAndQueue(v.slice(0, ls) + v.slice(ls + 2));
        requestAnimationFrame(() => el.setSelectionRange(Math.max(ls, s - 2), Math.max(ls, s - 2)));
      } else {
        setBodyAndQueue(v.slice(0, ls) + "  " + v.slice(ls));
        requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
      }
    }
  };

  const insertImage = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Only images can be embedded");
    setUploading(true);
    try {
      const a = await uploadAttachment(f);
      const el = ta.current;
      const pos = el && mode === "write" ? el.selectionEnd : body.length;
      const md = `${pos > 0 && body[pos - 1] !== "\n" ? "\n" : ""}![${f.name.replace(/[[\]]/g, "")}](${a.url})\n`;
      setBodyAndQueue(body.slice(0, pos) + md + body.slice(pos));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 32);
    setTagDraft("");
    if (!t || tags.includes(t) || tags.length >= 20) return;
    const next = [...tags, t];
    setTags(next);
    queue({ tags: next }, true);
  };
  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    queue({ tags: next }, true);
  };

  const prog = checklistProgress(body);
  const folder = folders.find((f) => f.id === note.folder_id);

  return (
    <article className="ne">
      <header className="ne-top">
        {onBack && (
          <IconButton label="Back to notes" onClick={onBack} className="ne-back">
            <ArrowLeft size={18} />
          </IconButton>
        )}
        <label className="ne-folder">
          <Folder size={14} />
          <select
            aria-label="Folder"
            value={note.folder_id ?? ""}
            onChange={(e) => queue({ folder_id: e.target.value || null }, true)}
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <span className={`ne-save is-${save}`} aria-live="polite">
          {save === "saving" || save === "pending" ? (
            <>
              <Spinner size={12} /> Saving…
            </>
          ) : save === "saved" ? (
            <>
              <Check size={13} /> Saved
            </>
          ) : save === "error" ? (
            <button onClick={() => void flush()}>Retry save</button>
          ) : null}
        </span>
        <span className="grow" />
        <IconButton label={note.pinned ? "Unpin" : "Pin to top"} active={note.pinned} onClick={() => queue({ pinned: !note.pinned }, true)}>
          <Pin size={17} className={note.pinned ? "ne-on" : ""} />
        </IconButton>
        <IconButton label={note.starred ? "Unstar" : "Star"} active={note.starred} onClick={() => queue({ starred: !note.starred }, true)}>
          <Star size={17} className={note.starred ? "ne-star" : ""} fill={note.starred ? "currentColor" : "none"} />
        </IconButton>
        <div className="ne-menu-wrap">
          <IconButton label="More" onClick={() => setMenu((m) => !m)} active={menu}>
            <MoreHorizontal size={18} />
          </IconButton>
          {menu && (
            <div className="ne-menu" onMouseLeave={() => setMenu(false)}>
              <button
                onClick={() => {
                  setMenu(false);
                  void navigator.clipboard?.writeText(`# ${title}\n\n${body}`).then(() => toast.success("Copied as Markdown"));
                }}
              >
                Copy as Markdown
              </button>
              <button
                className="is-danger"
                onClick={() => {
                  setMenu(false);
                  onDelete(note);
                }}
              >
                <Trash2 size={15} /> Delete note
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="ne-scroll">
        <div className="ne-inner">
          <div className="ne-titlerow">
            <input
              className="ne-title"
              placeholder="Untitled"
              value={title}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value);
                queue({ title: e.target.value });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setMode("write");
                  requestAnimationFrame(() => ta.current?.focus());
                }
              }}
            />
          </div>
          <div className="ne-meta">
            {folder && <span className="ne-chip">{folder.name}</span>}
            <span>Last edited {editedLabel(note.updated_at)}</span>
            {prog.total > 0 && (
              <span className="ne-prog" title={`${prog.done} of ${prog.total} done`}>
                <span className="ne-prog-bar">
                  <span style={{ width: `${(prog.done / prog.total) * 100}%` }} />
                </span>
                {prog.done}/{prog.total}
              </span>
            )}
          </div>
          <div className="ne-tags">
            {tags.map((t) => (
              <span key={t} className="ne-tag">
                #{t}
                <button aria-label={`Remove tag ${t}`} onClick={() => removeTag(t)}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              className="ne-tag-input"
              placeholder={tags.length ? "Add tag" : "+ Add tags"}
              value={tagDraft}
              onChange={(e) => (e.target.value.endsWith(",") || e.target.value.endsWith(" ") ? addTag(e.target.value.slice(0, -1)) : setTagDraft(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag(tagDraft);
                if (e.key === "Backspace" && !tagDraft && tags.length) removeTag(tags[tags.length - 1]);
              }}
              onBlur={() => tagDraft && addTag(tagDraft)}
            />
          </div>

          <div className="ne-toolbar" role="toolbar" aria-label="Formatting">
            <IconButton size="sm" label="Bold (⌘B)" onClick={() => apply("bold")}>
              <Bold size={16} />
            </IconButton>
            <IconButton size="sm" label="Italic (⌘I)" onClick={() => apply("italic")}>
              <Italic size={16} />
            </IconButton>
            <IconButton size="sm" label="Heading" onClick={() => apply("h")}>
              <Heading size={16} />
            </IconButton>
            <span className="ne-tsep" />
            <IconButton size="sm" label="Bulleted list" onClick={() => apply("ul")}>
              <List size={16} />
            </IconButton>
            <IconButton size="sm" label="Numbered list" onClick={() => apply("ol")}>
              <ListOrdered size={16} />
            </IconButton>
            <IconButton size="sm" label="Checklist" onClick={() => apply("check")}>
              <CheckSquare size={16} />
            </IconButton>
            <IconButton size="sm" label="Quote" onClick={() => apply("quote")}>
              <Quote size={16} />
            </IconButton>
            <span className="ne-tsep" />
            <IconButton size="sm" label="Inline code" onClick={() => apply("code")}>
              <Code size={16} />
            </IconButton>
            <IconButton size="sm" label="Link" onClick={() => apply("link")}>
              <Link2 size={16} />
            </IconButton>
            <IconButton size="sm" label="Insert image" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner size={14} /> : <ImagePlus size={16} />}
            </IconButton>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (void insertImage(e.target.files?.[0]), (e.target.value = ""))} />
            <span className="grow" />
            <div className="ne-mode tabs tabs-pill" role="tablist">
              <button role="tab" aria-selected={mode === "write"} className={`tab ${mode === "write" ? "is-active" : ""}`} onClick={() => setMode("write")}>
                <PenLine size={14} /> <span>Write</span>
              </button>
              <button role="tab" aria-selected={mode === "read"} className={`tab ${mode === "read" ? "is-active" : ""}`} onClick={() => (void flush(), setMode("read"))}>
                <Eye size={14} /> <span>Preview</span>
              </button>
            </div>
          </div>

          {mode === "write" ? (
            <textarea
              ref={ta}
              className="ne-body"
              value={body}
              placeholder={"Start writing…\n\nTip: “- [ ] ” makes a checklist, “## ” a heading. ⌘E toggles preview."}
              onChange={(e) => setBodyAndQueue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                  e.preventDefault();
                  apply("bold");
                } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
                  e.preventDefault();
                  apply("italic");
                } else onBodyKey(e);
              }}
              onPaste={(e) => {
                const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
                if (f) {
                  e.preventDefault();
                  void insertImage(f);
                }
              }}
              onBlur={() => void flush()}
              autoFocus={!note.body}
            />
          ) : (
            <div
              className="ne-read"
              onDoubleClick={() => setMode("write")}
              onClick={(e) => {
                if (!body.trim() && e.target === e.currentTarget) setMode("write");
              }}
            >
              {body.trim() ? (
                <Markdown src={body} onToggle={(line) => setBodyAndQueue(toggleCheck(body, line))} />
              ) : (
                <p className="faint">Nothing here yet. Click to start writing.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

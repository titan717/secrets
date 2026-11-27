import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, FileText, Folder, FolderPlus, Hash, Inbox, Pencil, Pin, Plus, Search, Star, Trash2, X } from "lucide-react";
import type { Note, NoteFolder } from "@secrets/shared";
import { Button, EmptyState, IconButton, Spinner } from "../../ui";
import { PageHeader } from "../PageHeader";
import { notesApi, type NoteQuery } from "../../lib/features/api";
import { snippet, checklistProgress } from "../../lib/features/markdown";
import { useConfirm } from "../../lib/features/Confirm";
import { errorMessage } from "../../lib/api";
import { listTime } from "../../lib/time";
import { toast } from "../../stores/toast";
import { NoteEditor } from "./NoteEditor";
import { TasksPanel } from "./TasksPanel";
import "./notes.css";

type Filter = { kind: "all" } | { kind: "pinned" } | { kind: "starred" } | { kind: "none" } | { kind: "folder"; id: string } | { kind: "tag"; tag: string };
const FILTER_KEY = "secrets.notes.filter";

const sortNotes = (ns: Note[]) => [...ns].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
const sameFilter = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b);

function toQuery(f: Filter, q: string): NoteQuery {
  const base: NoteQuery = q.trim() ? { q: q.trim() } : {};
  switch (f.kind) {
    case "pinned":
      return { ...base, pinned: "1" };
    case "starred":
      return { ...base, starred: "1" };
    case "none":
      return { ...base, folder_id: "none" };
    case "folder":
      return { ...base, folder_id: f.id };
    case "tag":
      return { ...base, tag: f.tag };
    default:
      return base;
  }
}

export default function NotesPage() {
  const { id: selectedId } = useParams<{ id?: string }>();
  const nav = useNavigate();
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [allCount, setAllCount] = useState<number | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilterState] = useState<Filter>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? "") as Filter;
    } catch {
      return { kind: "all" };
    }
  });
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [current, setCurrent] = useState<Note | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const { confirm, dialog } = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);

  const setFilter = (f: Filter) => {
    setFilterState(f);
    sessionStorage.setItem(FILTER_KEY, JSON.stringify(f));
  };

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const loadMeta = useCallback(async () => {
    try {
      const [fs, ts, all] = await Promise.all([notesApi.folders(), notesApi.tags(), notesApi.list()]);
      setFolders(fs);
      setTags(ts);
      setAllCount(all.length);
    } catch {
      /* list error surfaces below */
    }
  }, []);
  const metaTimer = useRef<ReturnType<typeof setTimeout>>();
  const refreshMeta = useCallback(() => {
    clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(() => void loadMeta(), 400);
  }, [loadMeta]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  // Load list for current filter + search.
  useEffect(() => {
    let live = true;
    setLoading(true);
    notesApi
      .list(toQuery(filter, dq))
      .then((ns) => {
        if (!live) return;
        setNotes(sortNotes(ns));
        setError(null);
      })
      .catch((e) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [filter, dq]);

  // Resolve the selected note (from list or by id).
  useEffect(() => {
    if (!selectedId) return setCurrent(null);
    if (current?.id === selectedId) return;
    const inList = notes.find((n) => n.id === selectedId);
    if (inList) return setCurrent(inList);
    let live = true;
    notesApi
      .get(selectedId)
      .then((n) => live && setCurrent(n))
      .catch(() => {
        if (!live) return;
        toast.error("That note doesn't exist anymore");
        nav("/notes", { replace: true });
      });
    return () => {
      live = false;
    };
  }, [selectedId, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘K focuses search, ⌘⇧N / Alt+N creates a note.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void create();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const onNoteChange = useCallback(
    (n: Note) => {
      setCurrent((c) => {
        if (c && c.id === n.id && (c.folder_id !== n.folder_id || c.tags.join() !== n.tags.join() || c.pinned !== n.pinned || c.starred !== n.starred)) refreshMeta();
        return c?.id === n.id ? n : c;
      });
      setNotes((ns) => sortNotes(ns.map((x) => (x.id === n.id ? n : x))));
    },
    [refreshMeta],
  );

  const create = async () => {
    try {
      const n = await notesApi.create({
        title: "",
        body: "",
        folder_id: filter.kind === "folder" ? filter.id : null,
        tags: filter.kind === "tag" ? [filter.tag] : [],
        pinned: filter.kind === "pinned",
        starred: filter.kind === "starred",
      });
      setQ("");
      setNotes((ns) => sortNotes([n, ...ns]));
      setCurrent(n);
      nav(`/notes/${n.id}`);
      refreshMeta();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async (n: Note) => {
    if (!(await confirm("Delete this note?", { body: `“${n.title || "Untitled"}” will be permanently deleted.` }))) return;
    try {
      await notesApi.remove(n.id);
      setNotes((ns) => ns.filter((x) => x.id !== n.id));
      if (selectedId === n.id) nav("/notes");
      refreshMeta();
      toast.success("Note deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const addFolder = async (name: string) => {
    setNewFolder(null);
    if (!name.trim()) return;
    try {
      const f = await notesApi.createFolder(name.trim());
      setFolders((fs) => [...fs, f]);
      setFilter({ kind: "folder", id: f.id });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const renameFolder = async () => {
    const r = renaming;
    setRenaming(null);
    if (!r || !r.name.trim()) return;
    try {
      const f = await notesApi.renameFolder(r.id, r.name.trim());
      setFolders((fs) => fs.map((x) => (x.id === f.id ? { ...x, name: f.name } : x)));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const deleteFolder = async (f: NoteFolder) => {
    if (!(await confirm(`Delete folder “${f.name}”?`, { body: "Notes inside are kept and moved to No folder." }))) return;
    try {
      await notesApi.removeFolder(f.id);
      setFolders((fs) => fs.filter((x) => x.id !== f.id));
      if (filter.kind === "folder" && filter.id === f.id) setFilter({ kind: "all" });
      refreshMeta();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const filterTitle = useMemo(() => {
    switch (filter.kind) {
      case "pinned":
        return "Pinned";
      case "starred":
        return "Starred";
      case "none":
        return "No folder";
      case "folder":
        return folders.find((f) => f.id === filter.id)?.name ?? "Folder";
      case "tag":
        return `#${filter.tag}`;
      default:
        return "All notes";
    }
  }, [filter, folders]);

  const navBtn = (f: Filter, icon: React.ReactNode, label: string, count?: number | null, key?: string) => (
    <button key={key} className={`nf-item ${sameFilter(f, filter) ? "is-active" : ""}`} onClick={() => setFilter(f)}>
      {icon}
      <span className="grow truncate">{label}</span>
      {count != null && <span className="nf-count">{count}</span>}
    </button>
  );

  return (
    <div className={`page notes-page ${selectedId ? "has-note" : ""}`}>
      <PageHeader
        title="Notes"
        className="notes-header"
        actions={
          <>
            <label className="input-wrap input-box notes-search">
              <Search size={16} className="input-adorn" />
              <input ref={searchRef} className="input" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
              {q && (
                <button className="input-adorn" onClick={() => setQ("")} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
            <Button size="sm" icon={<Plus size={16} />} onClick={() => void create()}>
              New note
            </Button>
          </>
        }
      />
      <div className="notes-grid">
        <nav className="nf" aria-label="Folders and tags">
          <h4 className="nf-h">Folders</h4>
          {navBtn({ kind: "all" }, <FileText size={16} />, "All notes", allCount)}
          {navBtn({ kind: "pinned" }, <Pin size={16} />, "Pinned")}
          {navBtn({ kind: "starred" }, <Star size={16} />, "Starred")}
          {folders.map((f) =>
            renaming?.id === f.id ? (
              <form key={f.id} className="nf-edit" onSubmit={(e) => (e.preventDefault(), void renameFolder())}>
                <Folder size={16} />
                <input autoFocus value={renaming.name} maxLength={64} onChange={(e) => setRenaming({ id: f.id, name: e.target.value })} onBlur={() => void renameFolder()} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
              </form>
            ) : (
              <div key={f.id} className="nf-row">
                {navBtn({ kind: "folder", id: f.id }, <Folder size={16} />, f.name, f.note_count)}
                <span className="nf-tools">
                  <IconButton size="sm" label={`Rename ${f.name}`} onClick={() => setRenaming({ id: f.id, name: f.name })}>
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton size="sm" label={`Delete ${f.name}`} onClick={() => void deleteFolder(f)}>
                    <Trash2 size={13} />
                  </IconButton>
                </span>
              </div>
            ),
          )}
          {navBtn({ kind: "none" }, <Inbox size={16} />, "No folder")}
          {newFolder !== null ? (
            <form className="nf-edit" onSubmit={(e) => (e.preventDefault(), void addFolder(newFolder))}>
              <FolderPlus size={16} />
              <input autoFocus placeholder="Folder name" value={newFolder} maxLength={64} onChange={(e) => setNewFolder(e.target.value)} onBlur={() => void addFolder(newFolder)} onKeyDown={(e) => e.key === "Escape" && setNewFolder(null)} />
              <button type="submit" aria-label="Create folder">
                <Check size={14} />
              </button>
            </form>
          ) : (
            <button className="nf-item nf-add" onClick={() => setNewFolder("")}>
              <FolderPlus size={16} /> New folder
            </button>
          )}
          {tags.length > 0 && (
            <>
              <h4 className="nf-h">Tags</h4>
              {tags.map((t) => (
                navBtn({ kind: "tag", tag: t.tag }, <Hash size={15} />, t.tag, t.count, t.tag)
              ))}
            </>
          )}
        </nav>

        <section className="nl" aria-label={filterTitle}>
          <div className="nl-chips">
            {[{ kind: "all" } as Filter, { kind: "pinned" } as Filter, { kind: "starred" } as Filter, ...folders.map((f) => ({ kind: "folder", id: f.id }) as Filter), ...tags.map((t) => ({ kind: "tag", tag: t.tag }) as Filter)].map((f) => (
              <button key={JSON.stringify(f)} className={`chip ${sameFilter(f, filter) ? "is-active" : ""}`} onClick={() => setFilter(f)}>
                {f.kind === "all" ? "All" : f.kind === "pinned" ? "Pinned" : f.kind === "starred" ? "Starred" : f.kind === "folder" ? folders.find((x) => x.id === f.id)?.name : `#${(f as { tag: string }).tag}`}
              </button>
            ))}
          </div>
          <header className="nl-head">
            <h3 className="truncate">{dq ? `Results for “${dq}”` : filterTitle}</h3>
            <span className="faint">{loading ? "" : notes.length}</span>
          </header>
          {loading && !notes.length ? (
            <div className="page-loading">
              <Spinner />
            </div>
          ) : error ? (
            <EmptyState compact title="Couldn't load notes" body={error} />
          ) : notes.length === 0 ? (
            <EmptyState
              compact
              title={dq ? "No matches" : "No notes here yet"}
              body={dq ? "Try a different word or clear the search." : "Capture ideas, checklists and plans. They're private to you."}
              action={!dq && <Button size="sm" icon={<Plus size={15} />} onClick={() => void create()}>New note</Button>}
            />
          ) : (
            <ul className="nl-list">
              {notes.map((n) => {
                const p = checklistProgress(n.body);
                return (
                  <li key={n.id}>
                    <button className={`nl-item ${n.id === selectedId ? "is-active" : ""}`} onClick={() => nav(`/notes/${n.id}`)}>
                      <span className="nl-row">
                        <span className={`nl-title truncate ${n.title ? "" : "faint"}`}>{n.title || "Untitled"}</span>
                        {n.pinned && <Pin size={13} className="nl-pin" />}
                        {n.starred && <Star size={13} className="nl-star" fill="currentColor" />}
                      </span>
                      <span className="nl-snip">{snippet(n.body) || <span className="faint">No content</span>}</span>
                      <span className="nl-meta">
                        <span>{listTime(n.updated_at)}</span>
                        {p.total > 0 && (
                          <span>
                            ☑ {p.done}/{p.total}
                          </span>
                        )}
                        {n.tags.slice(0, 2).map((t) => (
                          <span key={t} className="nl-tag">
                            #{t}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="nedit">
          {current && current.id === selectedId ? (
            <NoteEditor key={current.id} note={current} folders={folders} onChange={onNoteChange} onDelete={(n) => void remove(n)} onBack={() => nav("/notes")} />
          ) : selectedId ? (
            <div className="page-loading">
              <Spinner />
            </div>
          ) : (
            <EmptyState
              title="Pick a note"
              body={
                <>
                  Select a note on the left or start a fresh one. <span className="faint">Alt+N</span>
                </>
              }
              action={<Button icon={<Plus size={16} />} onClick={() => void create()}>New note</Button>}
            />
          )}
        </div>

        <TasksPanel />
      </div>
      {dialog}
    </div>
  );
}

export { NotesPage };

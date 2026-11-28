import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Search } from "lucide-react";
import type { AiProject, AiProjectInput } from "@secrets/shared";
import { Button, Input, Modal, TextArea } from "../../ui";
import { useAiProjects } from "../../lib/ai/projects";
import { useAiUpcoming } from "../../lib/ai/upcoming";
import { chatText, useAiChats } from "../../lib/ai/chats";
import { bridge, bridgeEnabled } from "../../lib/ai/bridge";
import { toast } from "../../stores/toast";
import { DEFAULT_MODELS, useAiSettings } from "../../lib/ai/settings";
import { useAiUi } from "./uiState";

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ScheduleSheet({ open, onClose, defaultProjectId }: { open: boolean; onClose: () => void; defaultProjectId?: string }) {
  const schedule = useAiUpcoming((s) => s.schedule);
  const projects = useAiProjects((s) => s.projects);
  const nav = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(defaultProjectId);
  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setTitle("");
    setProjectId(defaultProjectId);
    setWhen(localInput(new Date(Date.now() + 60 * 60_000)));
  }, [open, defaultProjectId]);
  const at = when ? new Date(when) : null;
  const valid = !!prompt.trim() && !!at && !Number.isNaN(at.getTime());
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a task"
      className="g-sheet"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              schedule({ prompt: prompt.trim(), title, runAt: at!.toISOString(), projectId });
              toast.success(`Scheduled for ${at!.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`);
              onClose();
              nav("/ai/upcoming");
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <TextArea label="What should the assistant do?" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Summarize yesterday’s Dock activity and draft a recap" autoFocus />
      <Input label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Morning recap" />
      <Input label="When" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} hint={bridgeEnabled() ? "The bridge runs it, even with this tab closed." : "Runs while Secrets is open on this device. Turn on bridge sync to run it in the background."} />
      {projects.length > 0 && (
        <div className="field">
          <label className="field-label" htmlFor="sched-proj">
            Project
          </label>
          <select id="sched-proj" className="g-select" value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value || undefined)}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </Modal>
  );
}

const EMPTY: AiProjectInput = { name: "", workspace: "", repo: "", systemPrompt: "", defaultModel: "" };

export function ProjectSheet({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project?: AiProject; onSaved?: (p: AiProject) => void }) {
  const create = useAiProjects((s) => s.create);
  const update = useAiProjects((s) => s.update);
  const provider = useAiSettings((s) => s.provider);
  const [d, setD] = useState<AiProjectInput>(EMPTY);
  useEffect(() => {
    if (open) setD(project ? { name: project.name, workspace: project.workspace, repo: project.repo, systemPrompt: project.systemPrompt, defaultModel: project.defaultModel } : EMPTY);
  }, [open, project]);
  const f = (k: keyof AiProjectInput) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const repoOk = !d.repo || /^[\w.-]+\/[\w.-]+$/.test(d.repo.trim());
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Edit project" : "New project"}
      className="g-sheet"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!d.name.trim() || !repoOk}
            onClick={() => {
              const clean = { ...d, name: d.name.trim(), repo: d.repo.trim(), workspace: d.workspace.trim(), defaultModel: d.defaultModel.trim() };
              if (project) {
                update(project.id, clean);
                onSaved?.({ ...project, ...clean });
              } else onSaved?.(create(clean));
              onClose();
            }}
          >
            {project ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <Input label="Name" value={d.name} onChange={f("name")} placeholder="ai.secrets bridge" autoFocus />
      <Input label="Workspace path" value={d.workspace} onChange={f("workspace")} placeholder="~/code/ai.secrets" hint="Folder the bridge opens for this project’s sessions." spellCheck={false} />
      <Input label="Repository" value={d.repo} onChange={f("repo")} placeholder="owner/repo" error={repoOk ? null : "Use the owner/repo form"} spellCheck={false} />
      <Input label="Default model" value={d.defaultModel} onChange={f("defaultModel")} placeholder={`Leave empty to use your current model (${DEFAULT_MODELS[provider]})`} spellCheck={false} />
      <TextArea label="System prompt" rows={5} value={d.systemPrompt} onChange={f("systemPrompt")} placeholder="You are working on the ai.secrets bridge. Prefer small, tested changes." />
    </Modal>
  );
}

/** Recents + search (GET /v1/sessions?project=&q= when the bridge is on, local otherwise). */
export function SearchSheet() {
  const open = useAiUi((s) => s.searchOpen);
  const set = useAiUi((s) => s.set);
  const chats = useAiChats((s) => s.chats);
  const projects = useAiProjects((s) => s.projects);
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [project, setProject] = useState<string | "">("");
  const [remote, setRemote] = useState<{ id: string; title: string }[] | null>(null);

  useEffect(() => {
    if (!open) return setQ("");
  }, [open]);

  useEffect(() => {
    if (!open || !bridgeEnabled()) return setRemote(null);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q, ...(project ? { project } : {}) });
      bridge<{ sessions: { id: string; title: string }[] }>("GET", `/v1/sessions?${qs}`)
        .then((r) => setRemote(r.sessions))
        .catch(() => setRemote(null));
    }, 250);
    return () => clearTimeout(t);
  }, [open, q, project]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return chats
      .filter((c) => !c.incognito && (!project || c.projectId === project))
      .map((c) => {
        if (!t) return { c, snip: "" };
        const title = c.title.toLowerCase().includes(t);
        const body = chatText(c);
        const i = body.toLowerCase().indexOf(t);
        if (!title && i < 0) return null;
        const snip = i >= 0 ? `${i > 30 ? "…" : ""}${body.slice(Math.max(0, i - 30), i + t.length + 60).replace(/\s+/g, " ")}…` : "";
        return { c, snip };
      })
      .filter(Boolean)
      .sort((a, b) => b!.c.updatedAt.localeCompare(a!.c.updatedAt))
      .slice(0, 50) as { c: (typeof chats)[number]; snip: string }[];
  }, [chats, q, project]);

  const go = (id: string) => {
    set({ searchOpen: false, navOpen: false });
    nav(`/ai/${id}`);
  };

  const extra = remote?.filter((r) => !results.some((x) => x.c.id === r.id)) ?? [];

  return (
    <Modal open={open} onClose={() => set({ searchOpen: false })} title="Search chats" className="g-sheet g-search-sheet">
      <label className="g-search">
        <Search size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and messages" aria-label="Search chats" autoFocus />
      </label>
      {projects.length > 0 && (
        <div className="chips">
          <button type="button" className={`chip ${!project ? "is-active" : ""}`} onClick={() => setProject("")}>
            All
          </button>
          {projects.map((p) => (
            <button key={p.id} type="button" className={`chip ${project === p.id ? "is-active" : ""}`} onClick={() => setProject(p.id)}>
              <FolderOpen size={13} /> {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="g-results">
        {results.length === 0 && extra.length === 0 && <p className="faint g-small g-pad">{q ? "No chats match." : "No chats yet."}</p>}
        {results.map(({ c, snip }) => (
          <button key={c.id} type="button" className="g-result" onClick={() => go(c.id)}>
            <span className="g-result-title truncate">{c.title}</span>
            {snip ? <span className="g-result-snip">{snip}</span> : <span className="g-result-snip">{new Date(c.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>}
          </button>
        ))}
        {extra.map((r) => (
          <div key={r.id} className="g-result is-remote">
            <span className="g-result-title truncate">{r.title}</span>
            <span className="g-result-snip">On the bridge (not on this device)</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

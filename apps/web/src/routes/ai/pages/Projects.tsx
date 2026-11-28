import { useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FolderClosed, GitBranch, HardDrive, MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, EmptyState, Modal } from "../../../ui";
import { useAiProjects } from "../../../lib/ai/projects";
import { useAiChats } from "../../../lib/ai/chats";
import { ProjectSheet } from "../sheets";
import { useAiUi } from "../uiState";
import { PageShell, Card, relTime } from "./Shell";

export default function ProjectsPage() {
  const projects = useAiProjects((s) => s.projects);
  const chats = useAiChats((s) => s.chats);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const nav = useNavigate();
  const close = () => {
    setOpen(false);
    if (params.has("new")) setParams({}, { replace: true });
  };
  return (
    <PageShell
      title="Projects"
      actions={
        <Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>
          New project
        </Button>
      }
    >
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" body="Group chats around a workspace or repo, with shared instructions and a default model." action={<Button onClick={() => setOpen(true)}>Create a project</Button>} />
      ) : (
        <div className="g-grid">
          {projects.map((p) => (
            <Link key={p.id} to={`/ai/projects/${p.id}`} className="g-card g-proj">
              <FolderClosed size={22} className="g-proj-ic" />
              <div className="g-proj-name truncate">{p.name}</div>
              <div className="g-meta truncate">{p.repo || p.workspace || "No repo or workspace"}</div>
              <div className="g-meta">
                {chats.filter((c) => c.projectId === p.id).length} chats · updated {relTime(p.updatedAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
      <ProjectSheet open={open} onClose={close} onSaved={(p) => nav(`/ai/projects/${p.id}`)} />
    </PageShell>
  );
}

export function ProjectDetail() {
  const { projectId } = useParams();
  const p = useAiProjects((s) => s.projects.find((x) => x.id === projectId));
  const remove = useAiProjects((s) => s.remove);
  const chats = useAiChats((s) => s.chats.filter((c) => c.projectId === projectId && !c.incognito));
  const setUi = useAiUi((s) => s.set);
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  if (!p) return <Navigate to="/ai/projects" replace />;
  return (
    <PageShell
      title={p.name}
      actions={
        <>
          <Button icon={<MessageSquarePlus size={16} />} onClick={() => (setUi({ projectId: p.id, incognito: false }), nav("/ai"))}>
            New chat
          </Button>
          <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEdit(true)}>
            Edit
          </Button>
          <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setDel(true)} aria-label="Delete project" />
        </>
      }
    >
      <Card>
        <dl className="g-dl">
          <dt><HardDrive size={14} /> Workspace</dt>
          <dd>{p.workspace || <span className="faint">Not set</span>}</dd>
          <dt><GitBranch size={14} /> Repo</dt>
          <dd>{p.repo || <span className="faint">Not set</span>}</dd>
          <dt>Default model</dt>
          <dd>{p.defaultModel || <span className="faint">Follows your model choice</span>}</dd>
          <dt>Instructions</dt>
          <dd className="g-pre">{p.systemPrompt || <span className="faint">None</span>}</dd>
        </dl>
      </Card>
      <h3 className="g-sec">Chats</h3>
      {chats.length === 0 ? (
        <p className="faint">No chats in this project yet.</p>
      ) : (
        <ul className="g-rows">
          {chats.map((c) => (
            <li key={c.id}>
              <Link to={`/ai/${c.id}`} className="g-row">
                <span className="truncate grow">{c.title}</span>
                <span className="g-meta">{relTime(c.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ProjectSheet open={edit} onClose={() => setEdit(false)} project={p} />
      <Modal
        open={del}
        onClose={() => setDel(false)}
        size="sm"
        title="Delete project?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDel(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                for (const c of chats) useAiChats.getState().setProject(c.id, undefined);
                remove(p.id);
                nav("/ai/projects", { replace: true });
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="muted">Chats stay in Recents; they just leave the project.</p>
      </Modal>
    </PageShell>
  );
}

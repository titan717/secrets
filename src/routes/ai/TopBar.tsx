import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, EyeOff, FolderOpen, Menu, MoreVertical, Pencil, ScrollText, Share2, Trash2 } from "lucide-react";
import { Button, Input, Modal } from "../../ui";
import { useAiChats } from "../../lib/ai/chats";
import { useAiRuns } from "../../lib/ai/runner";
import { useAiShares } from "../../lib/ai/shares";
import { useAiProjects } from "../../lib/ai/projects";
import { modelLabel, useAiSettings } from "../../lib/ai/settings";
import { toast } from "../../stores/toast";
import { UsageRing } from "./UsageRing";
import { Popover, MenuItem } from "./Popover";
import { MASCOT } from "./mascot";
import { useAiUi } from "./uiState";
import { SystemPromptModal } from "./AiThread";

function workedFor(chatId: string): string {
  const c = useAiChats.getState().chats.find((x) => x.id === chatId);
  if (!c) return "0s";
  let ms = 0;
  for (const it of c.items) if (it.kind === "assistant") ms += Math.max(0, (it.finishedAt ?? Date.now()) - new Date(it.at).getTime());
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function SessionMenu({ chatId }: { chatId: string }) {
  const nav = useNavigate();
  const chat = useAiChats((s) => s.chats.find((c) => c.id === chatId));
  const { rename, remove, setProject, setIncognito } = useAiChats.getState();
  const live = useAiRuns((s) => !!s.live[chatId]);
  const createShare = useAiShares((s) => s.create);
  const projects = useAiProjects((s) => s.projects);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "project">("main");
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [prompt, setPrompt] = useState(false);
  if (!chat) return null;
  const close = () => (setOpen(false), setView("main"));
  return (
    <div className="g-plus-wrap">
      <button type="button" className="g-round" aria-label="Chat options" aria-haspopup="menu" aria-expanded={open} data-popover-anchor onClick={() => (open ? close() : setOpen(true))}>
        <MoreVertical size={20} />
      </button>
      <Popover open={open} onClose={close} label="Chat options" className="g-pop-down">
        {view === "project" ? (
          <>
            <div className="g-pop-title">Move to project</div>
            <MenuItem onClick={() => (setProject(chatId, undefined), close())} hint={!chat.projectId ? "✓" : undefined}>
              No project
            </MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} icon={<FolderOpen size={16} />} onClick={() => (setProject(chatId, p.id), close())} hint={chat.projectId === p.id ? "✓" : undefined}>
                {p.name}
              </MenuItem>
            ))}
            {projects.length === 0 && <MenuItem onClick={() => (close(), nav("/ai/projects?new=1"))}>+ New project…</MenuItem>}
          </>
        ) : (
          <>
            <div className="g-pop-info is-head">
              <Clock size={15} /> Worked for: {workedFor(chatId)}
            </div>
            <MenuItem icon={<Pencil size={17} />} onClick={() => (close(), setTitle(chat.title), setRenaming(true))}>
              Rename session
            </MenuItem>
            <MenuItem
              icon={<Share2 size={17} />}
              disabled={chat.incognito || chat.items.length === 0}
              onClick={async () => {
                close();
                try {
                  const s = await createShare(chatId);
                  await navigator.clipboard.writeText(s.url).catch(() => {});
                  toast.success("Read-only link copied");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Share link
            </MenuItem>
            <MenuItem icon={<FolderOpen size={17} />} onClick={() => setView("project")} hint={projects.find((p) => p.id === chat.projectId)?.name}>
              Project
            </MenuItem>
            <MenuItem icon={<ScrollText size={17} />} onClick={() => (close(), setPrompt(true))} hint={chat.systemPrompt ? "On" : undefined}>
              Instructions
            </MenuItem>
            <MenuItem icon={<EyeOff size={17} />} onClick={() => (setIncognito(chatId, !chat.incognito), close())} hint={chat.incognito ? "Incognito" : "Saved"}>
              Privacy
            </MenuItem>
            <MenuItem icon={<Trash2 size={17} />} danger disabled={live} onClick={() => (close(), setConfirmDel(true))}>
              Delete
            </MenuItem>
          </>
        )}
      </Popover>
      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename session"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button onClick={() => (rename(chatId, title), setRenaming(false))}>Save</Button>
          </>
        }
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (rename(chatId, title), setRenaming(false))} autoFocus aria-label="Session title" />
      </Modal>
      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Delete this chat?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDel(false);
                remove(chatId);
                nav("/ai", { replace: true });
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="muted">“{chat.title}” will be removed from this device. Shared links stop showing new messages.</p>
      </Modal>
      <SystemPromptModal chatId={chatId} open={prompt} onClose={() => setPrompt(false)} />
    </div>
  );
}

/** Blueprint header: [menu]  (mascot + model chip)  [usage ring]. */
export function TopBar({ chatId, title }: { chatId?: string; title?: string }) {
  const set = useAiUi((s) => s.set);
  const label = useAiSettings(modelLabel);
  return (
    <header className={`g-top ${title ? "has-title" : ""}`}>
      <div className="g-top-l">
        <button type="button" className="g-round g-menu-btn" aria-label="Open menu" onClick={() => set({ navOpen: true })}>
          <Menu size={22} />
        </button>
        {title && <h1 className="g-page-title">{title}</h1>}
      </div>
      {!title && (
        <button type="button" className="g-mascot" onClick={() => set({ modelsOpen: true })} aria-label={`Model: ${label}. Change model`}>
          <span className="g-mascot-disc">
            <img src={MASCOT} alt="" width={52} height={52} />
          </span>
          <span className="g-model-chip">{label}</span>
        </button>
      )}
      <div className="g-top-r">
        {chatId && <SessionMenu chatId={chatId} />}
        <UsageRing />
      </div>
    </header>
  );
}

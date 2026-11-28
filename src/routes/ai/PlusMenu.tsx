import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, EyeOff, FolderOpen, ScrollText } from "lucide-react";
import { useAiChats } from "../../lib/ai/chats";
import { useAiProjects } from "../../lib/ai/projects";
import { MenuItem } from "./Popover";
import { ScheduleSheet } from "./sheets";
import { useAiUi } from "./uiState";

/** "+" menu. In a thread it edits that chat; on the home screen it configures the next chat. */
export function PlusMenu({ chatId, close, onInstructions }: { chatId?: string; close: () => void; onInstructions?: () => void }) {
  const nav = useNavigate();
  const chat = useAiChats((s) => (chatId ? s.chats.find((c) => c.id === chatId) : undefined));
  const setProject = useAiChats((s) => s.setProject);
  const setIncognito = useAiChats((s) => s.setIncognito);
  const projects = useAiProjects((s) => s.projects);
  const draft = useAiUi();
  const [pickProject, setPickProject] = useState(false);
  const currentProject = chat ? chat.projectId : draft.projectId;
  const incognito = chat ? !!chat.incognito : draft.incognito;
  const hasItems = !!chat && chat.items.length > 0;

  if (pickProject)
    return (
      <>
        <div className="g-pop-title">Use a project</div>
        <MenuItem onClick={() => (chat ? setProject(chat.id, undefined) : draft.set({ projectId: undefined }), close())} hint={!currentProject ? "✓" : undefined}>
          No project
        </MenuItem>
        {projects.map((p) => (
          <MenuItem key={p.id} icon={<FolderOpen size={16} />} onClick={() => (chat ? setProject(chat.id, p.id) : draft.set({ projectId: p.id }), close())} hint={currentProject === p.id ? "✓" : undefined}>
            {p.name}
          </MenuItem>
        ))}
        <MenuItem onClick={() => (close(), nav("/ai/projects?new=1"))}>+ New project…</MenuItem>
      </>
    );

  return (
    <>
      <MenuItem icon={<FolderOpen size={17} />} onClick={() => setPickProject(true)} hint={projects.find((p) => p.id === currentProject)?.name}>
        Project
      </MenuItem>
      <MenuItem icon={<CalendarClock size={17} />} onClick={() => (close(), draft.set({ scheduleOpen: true }))}>
        Schedule a task
      </MenuItem>
      {onInstructions && (
        <MenuItem icon={<ScrollText size={17} />} onClick={() => (close(), onInstructions())} hint={chat?.systemPrompt ? "On" : undefined}>
          Instructions
        </MenuItem>
      )}
      <MenuItem
        icon={<EyeOff size={17} />}
        disabled={hasItems && !incognito}
        onClick={() => {
          if (chat) setIncognito(chat.id, !incognito);
          else draft.set({ incognito: !incognito });
          close();
        }}
        hint={incognito ? "On" : hasItems ? "New chats only" : undefined}
      >
        Incognito
      </MenuItem>
    </>
  );
}

export function ScheduleHost() {
  const open = useAiUi((s) => s.scheduleOpen);
  const projectId = useAiUi((s) => s.projectId);
  const set = useAiUi((s) => s.set);
  return <ScheduleSheet open={open} defaultProjectId={projectId} onClose={() => set({ scheduleOpen: false })} />;
}

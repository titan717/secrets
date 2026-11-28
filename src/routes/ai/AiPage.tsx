import { lazy, Suspense, useCallback, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { FolderOpen, X } from "lucide-react";
import type { AiUpcomingTask } from "@shared";
import { Spinner } from "../../ui";
import { useSession } from "../../stores/session";
import { useAiChats } from "../../lib/ai/chats";
import { sendMessage } from "../../lib/ai/runner";
import { useAiProjects } from "../../lib/ai/projects";
import { useAiMemory } from "../../lib/ai/memory";
import { useAiUsage } from "../../lib/ai/usage";
import { useAiUpcoming, useUpcomingRunner } from "../../lib/ai/upcoming";
import { ASSISTANT_NAME } from "../../lib/ai/settings";
import { GraceNav } from "./GraceNav";
import { TopBar } from "./TopBar";
import { Composer } from "./Composer";
import { AiThread } from "./AiThread";
import { PlusMenu, ScheduleHost } from "./PlusMenu";
import { ModelSheet } from "./ModelSheet";
import { SearchSheet } from "./sheets";
import { AiSettingsModal } from "./AiSettings";
import { useAiUi } from "./uiState";
import "../../styles/ai.css";
import "../../styles/grace.css";

const ProjectsPage = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/Projects").then((m) => ({ default: m.ProjectDetail })));
const UsagePage = lazy(() => import("./pages/Usage"));
const MemoryPage = lazy(() => import("./pages/Memory"));
const UpcomingPage = lazy(() => import("./pages/Upcoming"));
const ConnectionsPage = lazy(() => import("./pages/Connections"));
const SharedPage = lazy(() => import("./pages/Shared"));
const SharedView = lazy(() => import("./pages/Shared").then((m) => ({ default: m.SharedView })));
const ProvidersPage = lazy(() => import("./pages/Providers"));
const ApexPage = lazy(() => import("./pages/Apex"));

function firstName(name?: string | null) {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}

/** Start a chat from the home composer with the draft options, then stream. */
export function startChat(nav: ReturnType<typeof useNavigate>, text: string, opts: { projectId?: string; incognito?: boolean } = {}) {
  const id = useAiChats.getState().create({ projectId: opts.projectId, incognito: opts.incognito });
  nav(`/ai/${id}`);
  void sendMessage(id, text);
  return id;
}

function Home() {
  const nav = useNavigate();
  const user = useSession((s) => s.user);
  const draft = useAiUi();
  const project = useAiProjects((s) => s.projects.find((p) => p.id === draft.projectId));
  return (
    <div className="g-thread">
      <TopBar />
      <div className="g-scroll">
        <div className="g-home">
          {draft.incognito ? (
            <div className="g-incog">
              <h2>Incognito Mode</h2>
              <p>{ASSISTANT_NAME} doesn’t save incognito chats, use them for memory, or show them in Recents after you leave.</p>
            </div>
          ) : (
            <h2 className="g-greet">
              Hey, {firstName(user?.display_name)}. What are we working on?
            </h2>
          )}
          {project && (
            <button type="button" className="g-proj-chip" onClick={() => draft.set({ projectId: undefined })} aria-label={`Remove project ${project.name}`}>
              <FolderOpen size={14} /> {project.name} <X size={14} />
            </button>
          )}
        </div>
      </div>
      <Composer
        live={false}
        autoFocusKey="home"
        onSend={(t) => {
          startChat(nav, t, { projectId: draft.projectId, incognito: draft.incognito });
          draft.set({ incognito: false });
        }}
        onCustomEffort={() => draft.set({ settingsOpen: true })}
        plusMenu={(close) => <PlusMenu close={close} />}
      />
    </div>
  );
}

function ThreadRoute() {
  const { chatId } = useParams();
  const exists = useAiChats((s) => s.chats.some((c) => c.id === chatId));
  const select = useAiChats((s) => s.select);
  const set = useAiUi((s) => s.set);
  useEffect(() => {
    if (exists && chatId) select(chatId);
  }, [exists, chatId, select]);
  if (!exists || !chatId) return <Navigate to="/ai" replace />;
  return (
    <div className="g-thread-wrap">
      <TopBar chatId={chatId} />
      <AiThread chatId={chatId} onCustomEffort={() => set({ settingsOpen: true })} />
    </div>
  );
}

export function AiPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const ui = useAiUi();
  const activeId = loc.pathname.match(/^\/ai\/([0-9a-f-]{36})$/)?.[1];

  // Full-screen on mobile (the drawer has a way back to the rest of Secrets).
  useEffect(() => {
    document.body.classList.add("in-chat", "in-grace");
    return () => document.body.classList.remove("in-chat", "in-grace");
  }, []);

  // Pull bridge copies when sync is on (no-ops otherwise).
  useEffect(() => {
    void useAiProjects.getState().sync();
    void useAiMemory.getState().sync();
    void useAiUsage.getState().sync();
    void useAiUpcoming.getState().sync();
  }, []);

  useEffect(() => {
    if (!ui.navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ui.set({ navOpen: false });
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ui.navOpen, ui]);

  const runTask = useCallback(async (t: AiUpcomingTask) => {
    const id = useAiChats.getState().create({ title: t.title, projectId: t.projectId });
    await sendMessage(id, t.prompt);
    return id;
  }, []);
  useUpcomingRunner(runTask);

  const fallback = (
    <div className="g-center g-fill">
      <Spinner size={20} />
    </div>
  );

  return (
    <div className={`grace ${ui.navOpen ? "nav-open" : ""}`}>
      <div className="g-scrim" onClick={() => ui.set({ navOpen: false })} aria-hidden />
      <GraceNav activeId={activeId} />
      <main className="g-main">
        <Suspense fallback={fallback}>
          <Routes>
            <Route index element={<Home />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<ProjectDetail />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="memory" element={<MemoryPage />} />
            <Route path="upcoming" element={<UpcomingPage />} />
            <Route path="connections" element={<ConnectionsPage />} />
            <Route path="shared" element={<SharedPage />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="apex" element={<ApexPage />} />
            <Route path="s/:shareId" element={<SharedView />} />
            <Route path=":chatId" element={<ThreadRoute />} />
            <Route path="*" element={<Navigate to="/ai" replace />} />
          </Routes>
        </Suspense>
      </main>
      <ModelSheet open={ui.modelsOpen} onClose={() => ui.set({ modelsOpen: false })} />
      <SearchSheet />
      <ScheduleHost />
      <AiSettingsModal open={ui.settingsOpen} onClose={() => ui.set({ settingsOpen: false })} onProviders={() => (ui.set({ settingsOpen: false }), nav("/ai/providers"))} />
    </div>
  );
}

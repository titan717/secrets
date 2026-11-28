import { NavLink, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Bookmark, Clock, FolderClosed, Link2, PenLine, Search, Share2, Zap, KeyRound } from "lucide-react";
import { Avatar } from "../../ui";
import { useSession } from "../../stores/session";
import { useAiChats } from "../../lib/ai/chats";
import { useAiRuns } from "../../lib/ai/runner";
import { useAiUpcoming } from "../../lib/ai/upcoming";
import { ASSISTANT_NAME } from "../../lib/ai/settings";
import { UsageRing } from "./UsageRing";
import { useAiUi } from "./uiState";

const LINKS = [
  { to: "/ai/projects", label: "Projects", icon: FolderClosed },
  { to: "/ai/usage", label: "Usage & Limits", icon: BarChart3 },
  { to: "/ai/memory", label: "Memory", icon: Bookmark },
  { to: "/ai/upcoming", label: "Upcoming", icon: Clock, count: true },
  { to: "/ai/connections", label: "Connections", icon: Link2 },
  { to: "/ai/shared", label: "Shared links", icon: Share2 },
  { to: "/ai/providers", label: "Providers", icon: KeyRound },
  { to: "/ai/apex", label: "Apex", icon: Zap },
];

/** Left drawer from the blueprint: title + search, section links, Recents, New chat + avatar. */
export function GraceNav({ activeId }: { activeId?: string }) {
  const nav = useNavigate();
  const user = useSession((s) => s.user);
  const chats = useAiChats((s) => s.chats);
  const live = useAiRuns((s) => s.live);
  const upcoming = useAiUpcoming((s) => s.tasks.filter((t) => t.status === "scheduled" || t.status === "queued" || t.status === "running").length);
  const set = useAiUi((s) => s.set);
  const close = () => set({ navOpen: false });
  const recents = [...chats].filter((c) => !c.incognito && c.items.length > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40);

  return (
    <nav className="g-nav" aria-label={`${ASSISTANT_NAME} navigation`}>
      <div className="g-nav-head">
        <button type="button" className="g-nav-back mobile-only" aria-label="Back to Secrets" onClick={() => (close(), nav("/home"))}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="g-nav-title">{ASSISTANT_NAME}</h1>
        <button type="button" className="g-round" aria-label="Search chats" onClick={() => set({ searchOpen: true })}>
          <Search size={20} />
        </button>
        <span className="mobile-only">
          <UsageRing size={42} onClick={() => (close(), nav("/ai/usage"))} />
        </span>
      </div>
      <div className="g-nav-scroll">
        <ul className="g-nav-links">
          {LINKS.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} className={({ isActive }) => `g-nav-link ${isActive ? "is-active" : ""}`} onClick={close}>
                <l.icon size={21} strokeWidth={1.7} />
                <span className="grow">{l.label}</span>
                {l.count && upcoming > 0 && <span className="g-count">{upcoming}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="g-nav-sec">Recents</div>
        {recents.length === 0 && <p className="g-nav-empty">Your chats show up here.</p>}
        <ul className="g-recents">
          {recents.map((c) => (
            <li key={c.id}>
              <NavLink to={`/ai/${c.id}`} className={`g-recent ${c.id === activeId ? "is-active" : ""}`} onClick={close}>
                <span className="truncate grow">{c.title}</span>
                {live[c.id] && <span className="g-spin" aria-label="Running" />}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
      <div className="g-nav-foot">
        <button
          type="button"
          className="g-newchat"
          onClick={() => {
            close();
            set({ incognito: false, projectId: undefined });
            nav("/ai");
          }}
        >
          <PenLine size={18} /> Chat
        </button>
        <button type="button" className="g-avatar-btn" aria-label="AI settings" title="AI settings" onClick={() => set({ settingsOpen: true })}>
          <Avatar name={user?.display_name ?? "You"} src={user?.avatar_url} seed={user?.id ?? "me"} size={42} />
        </button>
      </div>
    </nav>
  );
}

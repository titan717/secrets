import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Home, MessageCircle, Phone, Anchor, Sparkle, NotebookPen, ListChecks, Vault, Bell, Settings, Plus, User as UserIcon,
  ChevronUp, LogOut, WifiOff, UserPlus, Users, Hash, KeyRound,
} from "lucide-react";
import { useSession } from "../stores/session";
import { useChat } from "../stores/chat";
import { Avatar, CoachTour, CountBadge, Modal, Wordmark, ListItem, Ghost } from "../ui";
import { api } from "../lib/api";
import { NewChatModal } from "./chats/NewChatModal";
import { AiDrawer } from "./ai/AiDrawer";
import { useUi } from "../stores/ui";
import { useFlags } from "../lib/flags";

const PRIMARY = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/chats", label: "Messages", icon: MessageCircle, badge: true, coach: "nav-messages" },
  { to: "/calls", label: "Calls", icon: Phone },
  { to: "/docks", label: "Docks", icon: Anchor, coach: "nav-docks" },
  { to: "/moments", label: "Moments", icon: Sparkle },
];
const SECONDARY = [
  { to: "/notes", label: "Notes", icon: NotebookPen, soon: false },
  { to: "/tasks", label: "Tasks", icon: ListChecks, soon: false },
  { to: "/vault", label: "Vault", icon: Vault, soon: false },
];

export function useUnreadTotal() {
  const conversations = useChat((s) => s.conversations);
  return useMemo(() => Object.values(conversations).reduce((n, c) => n + (c.kind === "channel" ? 0 : c.unread_count || 0), 0), [conversations]);
}

function UserChip() {
  const user = useSession((s) => s.user);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const logout = useLogout();
  if (!user) return null;
  return (
    <div className="user-chip-wrap">
      {open && (
        <div className="user-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" onClick={() => (setOpen(false), nav("/profile"))}>
            <UserIcon size={16} /> Profile
          </button>
          <button role="menuitem" onClick={() => (setOpen(false), nav("/settings"))}>
            <Settings size={16} /> Settings
          </button>
          <button role="menuitem" className="is-danger" onClick={logout}>
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}
      <button className="user-chip" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={34} online />
        <span className="grow user-chip-text">
          <span className="truncate">{user.display_name}</span>
          <span className="truncate faint">@{user.username}</span>
        </span>
        <ChevronUp size={16} className={`faint chev ${open ? "" : "is-down"}`} />
      </button>
    </div>
  );
}

export function useLogout() {
  const nav = useNavigate();
  return async () => {
    try {
      await api("POST /v1/auth/logout", { body: {} });
    } catch {
      /* ignore */
    }
    useSession.getState().clear();
    nav("/welcome", { replace: true });
  };
}

function Sidebar() {
  const unread = useUnreadTotal();
  const openAi = useUi((s) => s.setAiOpen);
  const flags = useFlags((s) => s.flags);
  const primary = PRIMARY.filter((i) => (i.to === "/moments" ? flags.experimental : i.to === "/calls" ? flags.calls : i.to === "/docks" ? flags.docks : true));
  const secondary = flags.experimental ? SECONDARY : [];
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar-brand">
        <Wordmark size={30} />
      </div>
      <div className="nav-group">
        {primary.map((i) => (
          <NavLink key={i.to} to={i.to} className="nav-item" data-coach={i.coach}>
            <i.icon size={19} strokeWidth={1.9} />
            <span className="grow">{i.label}</span>
            {i.badge && <CountBadge count={unread} />}
          </NavLink>
        ))}
      </div>
      <div className="nav-group">
        {secondary.map((i) => (
          <NavLink key={i.to} to={i.to} className="nav-item">
            <i.icon size={19} strokeWidth={1.9} />
            <span className="grow">{i.label}</span>
            {i.soon && <span className="soon-tag">Soon</span>}
          </NavLink>
        ))}
      </div>
      <div className="nav-group">
        <button className="nav-item nav-ai" onClick={() => openAi(true)} data-coach="nav-ai">
          <img src="/ghost-128.png" alt="" width={20} height={21} />
          <span className="grow">Ask</span>
          <span className="kbd">AI</span>
        </button>
      </div>
      <div className="nav-spacer" />
      <div className="nav-group">
        <NavLink to="/notifications" className="nav-item">
          <Bell size={19} strokeWidth={1.9} />
          <span className="grow">Notifications</span>
        </NavLink>
        <NavLink to="/settings" className="nav-item" data-coach="nav-settings">
          <Settings size={19} strokeWidth={1.9} />
          <span className="grow">Settings</span>
        </NavLink>
      </div>
      <UserChip />
    </nav>
  );
}

function MobileNav({ onPlus }: { onPlus: () => void }) {
  const unread = useUnreadTotal();
  const loc = useLocation();
  const isChats = loc.pathname.startsWith("/chats") || loc.pathname.startsWith("/home");
  return (
    <nav className="mobile-nav" aria-label="Main">
      <NavLink to="/chats" className={() => `mnav ${isChats ? "active" : ""}`}>
        <span className="mnav-ico">
          <Home size={22} />
          {unread > 0 && <span className="mnav-dot" />}
        </span>
        <span>Home</span>
      </NavLink>
      <NavLink to="/calls" className="mnav">
        <span className="mnav-ico">
          <Phone size={22} />
        </span>
        <span>Calls</span>
      </NavLink>
      <button className="mnav-fab" onClick={onPlus} aria-label="Create" data-coach="fab">
        <Plus size={26} />
      </button>
      <NavLink to="/docks" className="mnav">
        <span className="mnav-ico">
          <Anchor size={22} />
        </span>
        <span>Docks</span>
      </NavLink>
      <NavLink to="/profile" className="mnav">
        <span className="mnav-ico">
          <UserIcon size={22} />
        </span>
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}

function ConnectionBanner() {
  const status = useChat((s) => s.status);
  const pending = useChat((s) => Object.keys(s.pending).length);
  if (status !== "offline") return null;
  return (
    <div className="conn-banner" role="status">
      <WifiOff size={14} /> You’re offline. {pending ? `${pending} message${pending > 1 ? "s" : ""} will send when you reconnect.` : "Reconnecting…"}
    </div>
  );
}

export function Shell() {
  const [plus, setPlus] = useState(false);
  const newChat = useUi((s) => s.newChat);
  const setNewChat = useUi((s) => s.setNewChat);
  const aiOpen = useUi((s) => s.aiOpen);
  const setAiOpen = useUi((s) => s.setAiOpen);
  const nav = useNavigate();
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        <ConnectionBanner />
        <Outlet />
      </div>
      <MobileNav onPlus={() => setPlus(true)} />
      <Modal open={plus} onClose={() => setPlus(false)} title="Create" size="sm">
        <div className="list-group-body">
          <ListItem icon={<UserPlus size={18} />} title="New chat" subtitle="Message someone by username" chevron onClick={() => (setPlus(false), setNewChat("dm"))} />
          <ListItem icon={<Users size={18} />} title="New group" subtitle="Bring a few people together" chevron onClick={() => (setPlus(false), setNewChat("group"))} />
          <ListItem icon={<Hash size={18} />} title="Create a dock" subtitle="Channels for a community" chevron onClick={() => (setPlus(false), nav("/docks?create=1"))} />
          <ListItem icon={<KeyRound size={18} />} title="Join with invite code" chevron onClick={() => (setPlus(false), nav("/docks?join=1"))} />
          <ListItem leading={<Ghost size={22} />} title="Ask the ghost" subtitle="Your AI assistant" chevron onClick={() => (setPlus(false), setAiOpen(true))} />
        </div>
      </Modal>
      <NewChatModal mode={newChat} onClose={() => setNewChat(null)} />
      <AiDrawer open={aiOpen} onClose={() => setAiOpen(false)} />
      <CoachTour
        id="shell-v1"
        steps={[
          { target: "nav-messages", title: "All your chats, one place", body: "Direct messages and groups live here. Unread counts show up right on the icon." },
          { target: "new-chat", title: "Start something", body: "Find anyone by their @username, or pick a few people to make a group." },
          { target: "nav-docks", title: "Docks are for communities", body: "Create a dock with channels, or join a public one from Discover." },
          { target: "nav-ai", title: "Meet the ghost", body: "Ask your AI assistant anything. Your API keys never leave this device." },
        ]}
      />
    </div>
  );
}

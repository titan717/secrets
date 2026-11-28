import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCirclePlus, Users, Anchor, Sparkles, ChevronRight, Phone, QrCode } from "lucide-react";
import { useSession } from "../stores/session";
import { useChat, conversationTitle, conversationPeer, previewText } from "../stores/chat";
import { useDocks } from "../stores/docks";
import { useUi } from "../stores/ui";
import { listTime } from "../lib/time";
import { Avatar, GroupAvatar, CountBadge, Ghost, EmptyState, Button } from "../ui";
import { MomentsRow } from "./moments/MomentsRow";
import { DockIcon } from "./docks/DocksPage";
import "./home.css";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const me = useSession((s) => s.user);
  const conversations = useChat((s) => s.conversations);
  const users = useChat((s) => s.users);
  const presence = useChat((s) => s.presence);
  const mine = useDocks((s) => s.mine);
  const docks = useDocks((s) => s.docks);
  const setNewChat = useUi((s) => s.setNewChat);
  const setAiOpen = useUi((s) => s.setAiOpen);
  const nav = useNavigate();

  useEffect(() => {
    void useChat.getState().loadConversations();
    void useDocks.getState().loadMine();
  }, []);

  if (!me) return null;
  const recent = Object.values(conversations)
    .filter((c) => c.kind !== "channel")
    .sort((a, b) => (b.last_message?.created_at ?? b.created_at).localeCompare(a.last_message?.created_at ?? a.created_at))
    .slice(0, 5);
  const unread = Object.values(conversations).reduce((n, c) => n + (c.unread_count || 0), 0);
  const online = Object.values(users).filter((u) => u.id !== me.id && presence[u.id]).slice(0, 8);
  const myDocks = mine.map((id) => docks[id]).filter(Boolean).slice(0, 6);

  const actions = [
    { label: "New chat", icon: MessageCirclePlus, onClick: () => setNewChat("dm") },
    { label: "New group", icon: Users, onClick: () => setNewChat("group") },
    { label: "Create dock", icon: Anchor, onClick: () => nav("/docks?create=1") },
    { label: "Ask AI", icon: Sparkles, onClick: () => (setAiOpen ? setAiOpen(true) : nav("/ai")) },
  ];

  return (
    <div className="page home">
      <div className="home-inner">
        <header className="home-hero">
          <div className="col" style={{ gap: 6 }}>
            <span className="home-kicker">{greeting()},</span>
            <h1>{me.display_name.split(" ")[0]}</h1>
            <p className="muted">{unread ? `You have ${unread} unread ${unread === 1 ? "message" : "messages"}.` : "You’re all caught up."}</p>
          </div>
          <Ghost size={120} float className="home-ghost" />
        </header>

        <div className="home-actions">
          {actions.map((a) => (
            <button key={a.label} className="home-action" onClick={a.onClick}>
              <span className="home-action-icon">
                <a.icon size={20} />
              </span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>

        <section className="home-section">
          <MomentsRow />
        </section>

        <div className="home-grid">
          <section className="home-card">
            <div className="home-card-head">
              <h2>Recent chats</h2>
              <Link to="/chats" className="home-more">
                All chats <ChevronRight size={14} />
              </Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState compact title="No chats yet" body="Find friends by their @username." action={<Button size="sm" onClick={() => setNewChat("dm")}>Start a chat</Button>} />
            ) : (
              <div className="col" style={{ gap: 2 }}>
                {recent.map((c) => {
                  const title = conversationTitle(c, users, me.id);
                  const peer = conversationPeer(c, me.id);
                  return (
                    <Link key={c.id} to={`/chats/${c.id}`} className="home-row">
                      {c.kind === "dm" ? (
                        <Avatar name={title} src={peer?.avatar_url} seed={peer?.id ?? c.id} size={40} online={peer ? !!presence[peer.id] : undefined} />
                      ) : (
                        <GroupAvatar names={c.members.filter((m) => m.id !== me.id).map((m) => m.display_name)} src={c.avatar_url} seed={c.id} size={40} />
                      )}
                      <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
                        <span className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                          <strong className="truncate">{title}</strong>
                          <span className="faint home-time">{listTime(c.last_message?.created_at)}</span>
                        </span>
                        <span className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                          <span className="faint truncate">{previewText(c.last_message) || "No messages yet"}</span>
                          <CountBadge count={c.unread_count} />
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="home-card">
            <div className="home-card-head">
              <h2>Your docks</h2>
              <Link to="/docks" className="home-more">
                Discover <ChevronRight size={14} />
              </Link>
            </div>
            {myDocks.length === 0 ? (
              <EmptyState compact title="No docks yet" body="Docks are homes for communities." action={<Button size="sm" onClick={() => nav("/docks?create=1")}>Create a dock</Button>} />
            ) : (
              <div className="home-docks">
                {myDocks.map((d) => (
                  <Link key={d.id} to={d.channels?.[0] ? `/docks/${d.id}/${d.channels[0].id}` : `/docks/${d.id}`} className="home-dock">
                    <DockIcon dock={d} size={48} />
                    <span className="truncate">{d.name}</span>
                    <span className="faint">{d.member_count} {d.member_count === 1 ? "member" : "members"}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="home-card">
            <div className="home-card-head">
              <h2>Online now</h2>
            </div>
            {online.length === 0 ? (
              <p className="faint" style={{ margin: 0 }}>No one you know is online right now.</p>
            ) : (
              <div className="home-online">
                {online.map((u) => (
                  <Link key={u.id} to={`/u/${u.username}`} className="home-person">
                    <Avatar name={u.display_name} src={u.avatar_url} seed={u.id} size={48} online />
                    <span className="truncate">{u.display_name.split(" ")[0]}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="home-card home-share">
            <div className="col" style={{ gap: 4 }}>
              <h2>Bring your people</h2>
              <p className="muted" style={{ margin: 0 }}>Share your profile link or QR code so friends can find you.</p>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" icon={<QrCode size={16} />} onClick={() => nav("/profile")}>
                Share profile
              </Button>
              <Button size="sm" variant="secondary" icon={<Phone size={16} />} onClick={() => nav("/calls")}>
                Calls
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

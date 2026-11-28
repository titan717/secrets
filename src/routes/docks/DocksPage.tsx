import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Search, KeyRound, Link2, Copy, Hash, Users, Globe, Lock, Settings2, ArrowLeft, LogOut, UserPlus, X, Megaphone, Compass, Anchor } from "lucide-react";
import type { Dock, User } from "@shared";
import { api, errorMessage } from "../../lib/api";
import { useDocks, channelReadOnly, isStaff, roleRank } from "../../stores/docks";
import { useChat } from "../../stores/chat";
import { useSession } from "../../stores/session";
import { useUi } from "../../stores/ui";
import { toast } from "../../stores/toast";
import { Avatar, Button, EmptyState, IconButton, AuthImage, Spinner, Modal, CoachTour } from "../../ui";
import { ChatView } from "../chats/ChatView";
import { useInChatClass } from "../chats/ChatsPage";
import { CreateDockModal, JoinCodeModal, ManageDockModal, RoleBadge, InviteBox } from "./DockModals";
import "./docks.css";

const HUES = [268, 290, 248, 320, 200, 170, 340, 25];
function hue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function DockIcon({ dock, size = 44 }: { dock: Pick<Dock, "id" | "name" | "icon_url">; size?: number }) {
  const letters = dock.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="dock-icon" style={{ width: size, height: size, fontSize: size * 0.36, ["--hue" as string]: hue(dock.id) }} aria-hidden>
      {dock.icon_url ? <AuthImage path={dock.icon_url} alt="" /> : letters || "?"}
    </span>
  );
}

function useDockModals() {
  const [params, setParams] = useSearchParams();
  const create = params.get("create") === "1";
  const joinParam = params.get("join");
  const close = useCallback(
    (key: string) => {
      const next = new URLSearchParams(params);
      next.delete(key);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  return {
    create,
    join: joinParam !== null,
    joinCode: joinParam && joinParam !== "1" ? joinParam : undefined,
    openCreate: () => setParams({ create: "1" }),
    openJoin: () => setParams({ join: "1" }),
    closeCreate: () => close("create"),
    closeJoin: () => close("join"),
  };
}

export function DocksPage() {
  const { id, channelId } = useParams();
  const loadMine = useDocks((s) => s.loadMine);
  const modals = useDockModals();
  useEffect(() => {
    void loadMine();
  }, [loadMine]);
  useInChatClass(!!channelId);

  return (
    <>
      {id ? <DockView id={id} channelId={channelId} /> : <DocksHome onCreate={modals.openCreate} onJoin={modals.openJoin} />}
      <CreateDockModal open={modals.create} onClose={modals.closeCreate} />
      <JoinCodeModal open={modals.join} onClose={modals.closeJoin} initialCode={modals.joinCode} />
    </>
  );
}

/* ---------------------------------------------------------------- list + discover */

function DocksHome({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="split docks-split">
      <MyDocksList onCreate={onCreate} onJoin={onJoin} />
      <section className="split-detail desktop-only-flex">
        <Discover onCreate={onCreate} />
      </section>
    </div>
  );
}

function MyDocksList({ onCreate, onJoin, activeId }: { onCreate: () => void; onJoin: () => void; activeId?: string }) {
  const mine = useDocks((s) => s.mine);
  const docks = useDocks((s) => s.docks);
  const loaded = useDocks((s) => s.mineLoaded);
  const error = useDocks((s) => s.mineError);
  const [q, setQ] = useState("");
  const [handles, setHandles] = useState(false);
  const list = mine.map((id) => docks[id]).filter((d): d is Dock => !!d && (!q || d.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <aside className="split-list">
      <div className="list-head docks-head">
        <h1 className="page-title">Docks</h1>
        <div className="row" style={{ gap: 4 }}>
          <IconButton label="Dock handles" onClick={() => setHandles(true)} data-coach="dock-handles">
            <Link2 size={19} />
          </IconButton>
          <IconButton label="Join with invite code" onClick={onJoin}>
            <KeyRound size={19} />
          </IconButton>
          <IconButton label="Create a dock" onClick={onCreate} variant="soft">
            <Plus size={20} />
          </IconButton>
        </div>
      </div>
      <div className="list-search">
        <label className="search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your docks" aria-label="Search your docks" />
        </label>
      </div>
      <div className="list-scroll">
        <h3 className="list-group-title" style={{ padding: "var(--s-2) var(--s-3)" }}>
          Your docks
        </h3>
        {!loaded && (
          <div className="col" style={{ gap: 8, padding: "0 var(--s-2)" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="conv-skel">
                <span className="skeleton" style={{ width: 44, height: 44, borderRadius: 14 }} />
                <span className="grow col">
                  <span className="skeleton" style={{ width: "50%", height: 12 }} />
                  <span className="skeleton" style={{ width: "30%", height: 10 }} />
                </span>
              </div>
            ))}
          </div>
        )}
        {loaded && error && !list.length && <EmptyState compact title="Couldn’t load docks" body={error} action={<Button size="sm" variant="secondary" onClick={() => void useDocks.getState().loadMine()}>Try again</Button>} />}
        {loaded && !error && !mine.length && (
          <EmptyState compact title="No docks yet" body="Create one for your crew, or find a public dock to join." action={<Button size="sm" icon={<Plus size={16} />} onClick={onCreate}>Create a dock</Button>} />
        )}
        <div className="conv-list">
          {list.map((d) => (
            <Link key={d.id} to={d.channels?.[0] ? `/docks/${d.id}/${d.channels[0].id}` : `/docks/${d.id}`} className={`conv dock-row ${activeId === d.id ? "is-active" : ""}`}>
              <DockIcon dock={d} />
              <span className="conv-body">
                <span className="conv-top">
                  <span className="conv-title truncate">{d.name}</span>
                  {d.visibility === "private" ? <Lock size={13} className="faint" /> : null}
                </span>
                <span className="conv-bottom">
                  <span className="conv-preview truncate">
                    {d.member_count} {d.member_count === 1 ? "member" : "members"}
                    {d.channels?.length ? ` · ${d.channels.length} ${d.channels.length === 1 ? "channel" : "channels"}` : ""}
                  </span>
                  {d.my_role && d.my_role !== "member" && <RoleBadge role={d.my_role} />}
                </span>
              </span>
            </Link>
          ))}
        </div>
        <div className="mobile-only-block">
          <Discover onCreate={onCreate} compact />
        </div>
      </div>
      <DockHandlesModal open={handles} onClose={() => setHandles(false)} docks={mine.map((id) => docks[id]).filter((d): d is Dock => !!d)} />
      <CoachTour id="docks-v1" steps={[{ target: "dock-handles", title: "Dock Handles", body: "See and manage your docks' public links and handles." }]} />
    </aside>
  );
}

function Discover({ onCreate, compact }: { onCreate: () => void; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Dock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const join = useDocks((s) => s.join);
  const mine = useDocks((s) => s.mine);
  const nav = useNavigate();
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await api("GET /v1/docks/discover", { query: q.trim() ? { q: q.trim() } : {} });
        if (alive) {
          setResults(r);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const doJoin = async (d: Dock) => {
    setJoining(d.id);
    try {
      const j = await join(d.id);
      const full = j.channels?.length ? j : (await useDocks.getState().loadDock(d.id)) ?? j;
      toast.success(`You joined ${d.name}`);
      nav(full.channels?.[0] ? `/docks/${d.id}/${full.channels[0].id}` : `/docks/${d.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className={`discover ${compact ? "is-compact" : ""}`}>
      {!compact && (
        <div className="discover-hero">
          <span className="discover-kicker">
            <Compass size={14} /> Discover
          </span>
          <h2>Find your people</h2>
          <p className="muted">Public docks are open communities — hop into channels, meet members, and start talking.</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <Button icon={<Plus size={16} />} onClick={onCreate}>
              Create a dock
            </Button>
          </div>
        </div>
      )}
      <div className="discover-body">
        {compact && (
          <h3 className="list-group-title" style={{ padding: "var(--s-5) var(--s-3) var(--s-2)" }}>
            Discover public docks
          </h3>
        )}
        <label className="search discover-search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search public docks" aria-label="Search public docks" />
          {q && (
            <button className="search-x" onClick={() => setQ("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>
        {error && <p className="field-error">{error}</p>}
        {!results && !error && (
          <div className="row" style={{ justifyContent: "center", padding: 24 }}>
            <Spinner />
          </div>
        )}
        {results && !results.length && <p className="faint" style={{ textAlign: "center", padding: 16 }}>{q ? `No public docks match “${q}”.` : "No public docks yet — be the first."}</p>}
        <div className="dock-grid">
          {results?.filter((d) => !compact || !(mine.includes(d.id) || d.my_role)).map((d) => {
            const member = mine.includes(d.id) || !!d.my_role;
            return (
              <article key={d.id} className="dock-card">
                <div className="dock-card-banner" style={{ ["--hue" as string]: hue(d.id) }} />
                <div className="dock-card-body">
                  <DockIcon dock={d} size={52} />
                  <h3 className="truncate">{d.name}</h3>
                  <span className="faint dock-card-handle">/{d.handle}</span>
                  <p className="muted dock-card-desc">{d.description || "A public dock on Secrets."}</p>
                  <div className="row dock-card-foot">
                    <span className="faint row" style={{ gap: 4 }}>
                      <Users size={14} /> {d.member_count}
                    </span>
                    {member ? (
                      <Button size="sm" variant="secondary" onClick={() => nav(d.channels?.[0] ? `/docks/${d.id}/${d.channels[0].id}` : `/docks/${d.id}`)}>
                        Open
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => void doJoin(d)} loading={joining === d.id}>
                        Join
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- dock view */

function DockView({ id, channelId }: { id: string; channelId?: string }) {
  const dock = useDocks((s) => s.docks[id]);
  const loadDock = useDocks((s) => s.loadDock);
  const loadMembers = useDocks((s) => s.loadMembers);
  const members = useDocks((s) => s.members[id]);
  const [state, setState] = useState<"loading" | "ok" | "missing">(dock ? "ok" : "loading");
  const [manage, setManage] = useState<null | "overview" | "channels" | "members" | "invite">(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    let alive = true;
    void loadDock(id).then((d) => alive && setState(d ? "ok" : useDocks.getState().docks[id] ? "ok" : "missing"));
    return () => {
      alive = false;
    };
  }, [id, loadDock]);

  useEffect(() => {
    if (dock?.my_role) void loadMembers(id).catch(() => {});
  }, [id, dock?.my_role, loadMembers]);

  const memberMap = useMemo(() => new Map((members ?? []).map((m) => [m.user.id, m.user])), [members]);
  const lookupExtra = useCallback((uid: string): User | undefined => memberMap.get(uid), [memberMap]);

  if (state === "missing" && !dock)
    return (
      <div className="detail-empty" style={{ flex: 1 }}>
        <EmptyState title="Dock not found" body="It may have been deleted, or it’s private and you don’t have an invite." action={<Link className="btn btn-secondary btn-md" to="/docks">Back to docks</Link>} />
      </div>
    );
  if (!dock)
    return (
      <div className="detail-empty" style={{ flex: 1 }}>
        <Spinner />
      </div>
    );

  const channel = dock.channels.find((c) => c.id === channelId);
  // Desktop: always land on a channel.
  if (!channelId && isDesktop && dock.my_role && dock.channels[0]) return <Navigate to={`/docks/${id}/${dock.channels[0].id}`} replace />;
  if (channelId && dock.channels.length && !channel) return <Navigate to={`/docks/${id}`} replace />;

  const staff = isStaff(dock.my_role);

  return (
    <div className={`split dock-split ${channelId ? "has-detail" : ""}`}>
      <DockSidebar dock={dock} activeChannel={channelId} onManage={(t) => setManage(t)} />
      <section className="split-detail">
        {!dock.my_role ? (
          <DockPreview dock={dock} />
        ) : channel ? (
          <ChatView
            key={channel.id}
            conversationId={channel.id}
            channel={{ name: channel.name, topic: channel.topic, dockName: dock.name, readOnly: channelReadOnly(channel, dock.my_role) }}
            lookupExtra={lookupExtra}
            canModerate={staff}
            backTo={`/docks/${dock.id}`}
            sidePanel={<DockMembersPanel dock={dock} onManage={(t) => setManage(t)} />}
          />
        ) : (
          <div className="detail-empty">
            <EmptyState title="No channels yet" body={staff ? "Add a channel to get the conversation going." : "The admins haven’t opened any channels yet."} action={staff ? <Button icon={<Plus size={16} />} onClick={() => setManage("channels")}>Add channel</Button> : undefined} />
          </div>
        )}
      </section>
      {manage && <ManageDockModal dock={dock} open onClose={() => setManage(null)} initialTab={manage} />}
    </div>
  );
}

function useIsDesktop() {
  const [d, setD] = useState(() => window.matchMedia("(min-width: 861px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 861px)");
    const on = () => setD(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return d;
}

function DockSidebar({ dock, activeChannel, onManage }: { dock: Dock; activeChannel?: string; onManage: (t: "overview" | "channels" | "members" | "invite") => void }) {
  const nav = useNavigate();
  const leave = useDocks((s) => s.leave);
  const staff = isStaff(dock.my_role);
  const doLeave = async () => {
    if (!window.confirm(`Leave ${dock.name}?`)) return;
    try {
      await leave(dock.id);
      toast.info(`You left ${dock.name}`);
      nav("/docks");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <aside className="split-list dock-side">
      <div className="dock-side-head">
        <div className="dock-side-banner" style={{ ["--hue" as string]: hue(dock.id) }} />
        <div className="row dock-side-top">
          <IconButton label="All docks" onClick={() => nav("/docks")}>
            <ArrowLeft size={19} />
          </IconButton>
          <div className="grow" />
          {staff && (
            <IconButton label="Manage dock" onClick={() => onManage("overview")}>
              <Settings2 size={19} />
            </IconButton>
          )}
        </div>
        <div className="dock-side-id">
          <DockIcon dock={dock} size={56} />
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <h2 className="truncate">{dock.name}</h2>
            <span className="faint row" style={{ gap: 6 }}>
              {dock.visibility === "private" ? <Lock size={12} /> : <Globe size={12} />}
              {dock.visibility === "private" ? "Private" : "Public"} · {dock.member_count} {dock.member_count === 1 ? "member" : "members"}
            </span>
          </div>
        </div>
        {dock.description && <p className="muted dock-side-desc">{dock.description}</p>}
      </div>
      <div className="list-scroll">
        <div className="row channel-group-head">
          <h3 className="list-group-title">Channels</h3>
          {staff && (
            <IconButton label="Add channel" size="sm" onClick={() => onManage("channels")}>
              <Plus size={16} />
            </IconButton>
          )}
        </div>
        <nav className="channel-list" aria-label="Channels">
          {dock.channels.map((c) => {
            const Icon = c.name === "announcements" ? Megaphone : Hash;
            return (
              <Link key={c.id} to={dock.my_role ? `/docks/${dock.id}/${c.id}` : `/docks/${dock.id}`} className={`channel-link ${activeChannel === c.id ? "is-active" : ""}`} aria-current={activeChannel === c.id ? "page" : undefined}>
                <Icon size={17} />
                <span className="truncate">{c.name}</span>
                {c.name === "announcements" && !staff && <Lock size={12} className="faint" style={{ marginLeft: "auto" }} />}
              </Link>
            );
          })}
        </nav>
        {dock.my_role && (
          <div className="col dock-side-actions">
            <button className="channel-link" onClick={() => onManage("invite")}>
              <UserPlus size={17} /> <span>Invite people</span>
            </button>
            <button className="channel-link" onClick={() => onManage("members")}>
              <Users size={17} /> <span>Members</span>
            </button>
            {dock.my_role !== "owner" && (
              <button className="channel-link is-danger" onClick={() => void doLeave()}>
                <LogOut size={17} /> <span>Leave dock</span>
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function DockPreview({ dock }: { dock: Dock }) {
  const join = useDocks((s) => s.join);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const d = await join(dock.id);
      const full = d.channels?.length ? d : (await useDocks.getState().loadDock(dock.id)) ?? d;
      toast.success(`You joined ${dock.name}`);
      if (full.channels?.[0]) nav(`/docks/${dock.id}/${full.channels[0].id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="detail-empty">
      <div className="dock-preview">
        <DockIcon dock={dock} size={84} />
        <h2>{dock.name}</h2>
        <p className="muted">{dock.description || "A community on Secrets."}</p>
        <span className="faint row" style={{ gap: 6, justifyContent: "center" }}>
          <Users size={14} /> {dock.member_count} members · {dock.channels.length} channels
        </span>
        {dock.visibility === "public" ? (
          <Button size="lg" onClick={() => void go()} loading={busy}>
            Join {dock.name}
          </Button>
        ) : (
          <Button size="lg" variant="secondary" icon={<KeyRound size={17} />} onClick={() => nav("/docks?join=1")}>
            Join with invite code
          </Button>
        )}
      </div>
    </div>
  );
}

function DockMembersPanel({ dock, onManage }: { dock: Dock; onManage: (t: "overview" | "channels" | "members" | "invite") => void }) {
  const members = useDocks((s) => s.members[dock.id]);
  const presence = useChat((s) => s.presence);
  const setInfoOpen = useUi((s) => s.setInfoOpen);
  const me = useSession((s) => s.user?.id);
  const nav = useNavigate();
  const groups = useMemo(() => {
    const sorted = [...(members ?? [])].sort((a, b) => roleRank[b.role] - roleRank[a.role] || Number(!!presence[b.user.id]) - Number(!!presence[a.user.id]) || a.user.display_name.localeCompare(b.user.display_name));
    return {
      staff: sorted.filter((m) => m.role !== "member"),
      online: sorted.filter((m) => m.role === "member" && presence[m.user.id]),
      offline: sorted.filter((m) => m.role === "member" && !presence[m.user.id]),
    };
  }, [members, presence]);
  const section = (title: string, list: typeof groups.staff) =>
    list.length ? (
      <div className="col" style={{ gap: 2 }}>
        <h3 className="list-group-title" style={{ padding: "var(--s-3) var(--s-2) var(--s-1)" }}>
          {title} — {list.length}
        </h3>
        {list.map((m) => (
          <button key={m.user.id} className="person" onClick={() => nav(`/u/${m.user.username}`)}>
            <Avatar name={m.user.display_name} src={m.user.avatar_url} seed={m.user.id} size={34} online={!!presence[m.user.id]} />
            <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
              <span className="truncate person-name">
                {m.user.display_name}
                {m.user.id === me && <span className="faint"> (you)</span>}
              </span>
              <span className="faint truncate">@{m.user.username}</span>
            </span>
            <RoleBadge role={m.role} />
          </button>
        ))}
      </div>
    ) : null;
  return (
    <div className="info dock-members-panel">
      <div className="row info-head">
        <h2 className="info-title">Members</h2>
        <IconButton label="Close" onClick={() => setInfoOpen(false)}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="col" style={{ gap: "var(--s-3)", padding: "0 var(--s-4) var(--s-4)", overflowY: "auto", flex: 1 }}>
        <div className="dock-invite-card">
          <strong>Invite to {dock.name}</strong>
          <InviteBox dock={dock} />
        </div>
        {!members && <p className="faint">Loading…</p>}
        {section("Team", groups.staff)}
        {section("Online", groups.online)}
        {section("Offline", groups.offline)}
        {isStaff(dock.my_role) && (
          <Button variant="secondary" icon={<Anchor size={16} />} onClick={() => onManage("members")}>
            Manage roles
          </Button>
        )}
      </div>
    </div>
  );
}

/** Public links and handles for the docks you're in (blueprint p23 "Dock Handles"). */
function DockHandlesModal({ open, onClose, docks }: { open: boolean; onClose: () => void; docks: Dock[] }) {
  const copy = async (d: Dock) => {
    const link = `${window.location.origin}/docks/${d.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Dock handles" size="sm">
      {docks.length === 0 ? (
        <p className="faint" style={{ padding: "4px 4px 12px" }}>Join or create a dock to get a public link.</p>
      ) : (
        <ul className="dh-list">
          {docks.map((d) => (
            <li key={d.id} className="dh-row">
              <Avatar name={d.name} src={d.icon_url} seed={d.id} size={36} />
              <span className="grow col" style={{ gap: 0, minWidth: 0 }}>
                <span className="truncate" style={{ fontWeight: 600 }}>{d.name}</span>
                <span className="truncate faint">secrets.app/d/{d.handle}</span>
              </span>
              <IconButton label={`Copy link to ${d.name}`} onClick={() => void copy(d)}>
                <Copy size={17} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

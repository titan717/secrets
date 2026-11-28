import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bell, ChevronDown, CircleHelp, Cloud, Languages, LogOut, Palette, Pencil, QrCode, Search, ShieldCheck, Smartphone, User as UserIcon, UserPlus, X } from "lucide-react";
import { useSession } from "../../stores/session";
import { useSettings } from "../../stores/settings";
import { toast } from "../../stores/toast";
import { errorMessage } from "../../lib/api";
import { Avatar, Row, Sheet, PillButton } from "../../ui";
import { useLogout } from "../Shell";
import { AaIcon, GraceIcon, LANGUAGES, patchMe } from "./shared";
import { StyledName } from "../profile/NameStyle";

const ITEMS = [
  { to: "/settings/account", label: "Account", icon: <UserIcon />, keys: "profile username email password devices" },
  { to: "/settings/privacy", label: "Privacy", icon: <ShieldCheck />, keys: "read receipts typing online" },
  { to: "/settings/notifications", label: "Notifications", icon: <Bell />, keys: "alerts sounds" },
  { to: "/settings/appearance", label: "Appearance", icon: <Palette />, keys: "theme colors accent clock haptics icon wallpaper" },
  { to: "/settings/fonts", label: "Fonts", icon: <AaIcon />, keys: "font text" },
  { to: "/settings/stories", label: "Stories", icon: <Smartphone />, keys: "story moments" },
  { to: "/settings/storage", label: "Storage", icon: <Cloud />, keys: "cache data" },
  { to: "/ai", label: "Grace", icon: <GraceIcon />, keys: "assistant ai" },
  { to: "/settings/language", label: "App language", icon: <Languages />, keys: "language" },
  { to: "/settings/help", label: "Help", icon: <CircleHelp />, keys: "support tips about what's new" },
];

/** Settings home (blueprint p17, p18, p20). `/profile` renders this same screen. */
export function SettingsHome() {
  const user = useSession((s) => s.user);
  const language = useSettings((s) => s.language);
  const nav = useNavigate();
  const logout = useLogout();
  const scroller = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [feeling, setFeeling] = useState(false);
  const [accounts, setAccounts] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => setCollapsed(el.scrollTop > 150);
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);

  if (!user) return null;
  const lang = LANGUAGES.find((l) => l.id === language)?.native ?? "English";
  const q = query?.trim().toLowerCase() ?? "";
  const items = q ? ITEMS.filter((i) => `${i.label} ${i.keys}`.toLowerCase().includes(q)) : ITEMS;

  return (
    <div className="bp-screen sh" ref={scroller}>
      <header className={`sh-bar ${collapsed || query !== null ? "is-solid" : ""}`}>
        {query === null ? (
          <>
            <button className="bp-back sh-icon" aria-label="Back" onClick={() => nav("/chats")}>
              <ArrowLeft />
            </button>
            <h1 className="sh-title" aria-hidden={!collapsed}>
              {collapsed ? user.display_name : ""}
            </h1>
            <span className="sr-only">Settings</span>
            <button className="sh-icon" aria-label="Search settings" onClick={() => setQuery("")}>
              <Search />
            </button>
            <button className="sh-icon" aria-label="Edit profile" onClick={() => nav("/settings/profile")}>
              <Pencil />
            </button>
          </>
        ) : (
          <>
            <button className="bp-back sh-icon" aria-label="Close search" onClick={() => setQuery(null)}>
              <ArrowLeft />
            </button>
            <input className="sh-search" autoFocus placeholder="Search settings" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search settings" />
            {query && (
              <button className="sh-icon" aria-label="Clear" onClick={() => setQuery("")}>
                <X />
              </button>
            )}
          </>
        )}
      </header>

      {query === null && (
        <div className="sh-hero">
          <button className="sh-feeling" onClick={() => setFeeling(true)}>
            {user.status || "I’m feeling..."}
          </button>
          <span className="sh-feeling-dot" aria-hidden />
          <div className="sh-sheet">
            <button className="sh-avatar" onClick={() => nav("/settings/profile")} aria-label="Edit profile photo">
              <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={117} />
            </button>
            <button className="sh-qr" aria-label="Share profile" onClick={() => nav("/share")}>
              <QrCode />
            </button>
            <button className="sh-name" onClick={() => setAccounts(true)} aria-haspopup="dialog">
              <StyledName name={user.display_name} />
              <ChevronDown aria-hidden />
            </button>
            <div className="sh-handle">@{user.username}</div>
            <div className="sh-apex">
              <img src="/logo-mark.png" alt="" width={34} height={34} />
              <div className="sh-apex-text">
                <strong>Apex</strong>
                <span>Unlock all features</span>
              </div>
              <button className="sh-upgrade" onClick={() => toast.info("Apex is coming soon")}>
                Upgrade <ArrowRight aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="bp-list sh-list" aria-label="Settings">
        {items.map((i) => (
          <Row key={i.to} to={i.to} icon={i.icon} title={i.label} value={i.to === "/settings/language" ? lang : undefined} chevron={false} />
        ))}
        {items.length === 0 && <p className="sh-empty">No settings match “{query}”.</p>}
        {query === null && (
          <>
            <div className="sh-gap" />
            <Row to="/settings/add-account" icon={<UserPlus />} title="Add account" chevron={false} />
            <Row icon={<LogOut />} title="Log Out" danger onClick={() => void logout()} />
          </>
        )}
      </nav>

      <FeelingSheet open={feeling} onClose={() => setFeeling(false)} />
      <Sheet open={accounts} onClose={() => setAccounts(false)} title="Accounts">
        <div className="bp-group" style={{ marginTop: 0 }}>
          <Row icon={<Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={22} />} title={user.display_name} sub={`@${user.username}`} trailing={<span className="bp-radio on" aria-hidden />} onClick={() => setAccounts(false)} />
          <Row icon={<UserPlus />} title="Add account" onClick={() => (setAccounts(false), nav("/settings/add-account"))} />
        </div>
      </Sheet>
    </div>
  );
}

const FEELINGS = ["😊 Happy", "😴 Sleepy", "💻 Working", "🎧 Vibing", "🍕 Hungry", "🏃 Busy"];

function FeelingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText(user?.status ?? "");
  }, [open, user?.status]);
  const save = async (v: string | null) => {
    setBusy(true);
    try {
      await patchMe({ status: v });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="I’m feeling">
      <h3 className="sheet-h">I’m feeling...</h3>
      <input className="bp-field" value={text} maxLength={80} placeholder="Share how you’re feeling" onChange={(e) => setText(e.target.value)} aria-label="I’m feeling" />
      <div className="chip-row">
        {FEELINGS.map((f) => (
          <button key={f} className="bp-chip" onClick={() => setText(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="sheet-actions">
        {user?.status && (
          <PillButton variant="ghost" onClick={() => void save(null)} disabled={busy}>
            Clear
          </PillButton>
        )}
        <PillButton onClick={() => void save(text.trim() || null)} disabled={busy}>
          Save
        </PillButton>
      </div>
    </Sheet>
  );
}

import { useRef, useState, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { User as UserIcon, Palette, Bell, Shield, LifeBuoy, LogOut, ChevronRight, Monitor, Sun, Moon, CircleOff, ImagePlus, Check, Sparkles, Lightbulb, Copy, KeyRound, Smartphone, Info, Trash2 } from "lucide-react";
import { useSettings } from "../../stores/settings";
import { useSession } from "../../stores/session";
import { toast } from "../../stores/toast";
import { FONTS, WALLPAPERS, type ThemeMode } from "../../lib/theme";
import { Avatar, Button, ListGroup, ListItem, Toggle, Ghost } from "../../ui";
import { PageHeader } from "../PageHeader";
import { useLogout } from "../Shell";
import { AccentSwatches, profileUrl } from "../profile/ProfileCard";
import { wallpaperStyle } from "../chats/ChatView";
import "./settings.css";
import "../profile/profile.css";

const SECTIONS = [
  { id: "account", label: "Account", icon: UserIcon, hint: "Profile, username, devices" },
  { id: "appearance", label: "Appearance", icon: Palette, hint: "Theme, accent, wallpaper, font" },
  { id: "notifications", label: "Notifications", icon: Bell, hint: "Messages, docks, calls" },
  { id: "privacy", label: "Privacy & security", icon: Shield, hint: "Receipts, presence, encryption" },
  { id: "help", label: "Help & about", icon: LifeBuoy, hint: "Tips, version, support" },
] as const;

export function SettingsPage() {
  const loc = useLocation();
  const atRoot = /^\/settings\/?$/.test(loc.pathname);
  return (
    <div className={`settings ${atRoot ? "at-root" : "in-section"}`}>
      <SettingsNav />
      <div className="settings-main">
        <Routes>
          <Route index element={<DesktopDefault />} />
          <Route path="account" element={<AccountSection />} />
          <Route path="appearance" element={<AppearanceSection />} />
          <Route path="notifications" element={<NotificationsSection />} />
          <Route path="privacy" element={<PrivacySection />} />
          <Route path="help" element={<HelpSection />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function DesktopDefault() {
  // On desktop the root shows Appearance; on mobile only the nav list is visible.
  return <div className="desktop-only-block"><AppearanceSection /></div>;
}

function SettingsNav() {
  const user = useSession((s) => s.user);
  const logout = useLogout();
  const nav = useNavigate();
  const loc = useLocation();
  const atRoot = /^\/settings\/?$/.test(loc.pathname);
  return (
    <aside className="settings-nav">
      <PageHeader title="Settings" />
      <div className="settings-nav-body">
        {user && (
          <button className="settings-me" onClick={() => nav("/profile")}>
            <Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={52} />
            <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
              <strong className="truncate">{user.display_name}</strong>
              <span className="faint truncate">@{user.username}</span>
            </span>
            <ChevronRight size={18} className="faint" />
          </button>
        )}
        <nav className="settings-links" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <NavLink key={s.id} to={`/settings/${s.id}`} className={({ isActive }) => `settings-link ${isActive ? "is-active" : atRoot && s.id === "appearance" ? "is-default" : ""}`}>
              <span className="settings-link-icon">
                <s.icon size={18} />
              </span>
              <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
                <span>{s.label}</span>
                <span className="faint truncate settings-link-hint">{s.hint}</span>
              </span>
              <ChevronRight size={16} className="faint mobile-only" />
            </NavLink>
          ))}
        </nav>
        <button className="settings-link is-danger" onClick={() => void logout()}>
          <span className="settings-link-icon">
            <LogOut size={18} />
          </span>
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="settings-section page">
      <PageHeader title={title} subtitle={subtitle} back="/settings" className="settings-section-head" />
      <div className="page-body">{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- account */

function AccountSection() {
  const user = useSession((s) => s.user);
  const deviceId = useSession((s) => s.deviceId);
  const nav = useNavigate();
  const logout = useLogout();
  if (!user) return null;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn’t copy");
    }
  };
  return (
    <Section title="Account" subtitle="How you show up on Secrets">
      <ListGroup title="Profile">
        <ListItem leading={<Avatar name={user.display_name} src={user.avatar_url} seed={user.id} size={40} />} title={user.display_name} subtitle={user.about || "No bio yet"} chevron onClick={() => nav("/profile")} />
        <ListItem icon={<UserIcon size={18} />} title="Username" value={`@${user.username}`} onClick={() => void copy(user.username, "Username")} />
        <ListItem icon={<Copy size={18} />} title="Profile link" subtitle={profileUrl(user.username).replace(/^https?:\/\//, "")} onClick={() => void copy(profileUrl(user.username), "Link")} />
      </ListGroup>
      <ListGroup title="Security" footer="Passwords are hashed on the server; end-to-end encryption keys will live only on your devices.">
        <ListItem icon={<KeyRound size={18} />} title="Password" value="••••••••" subtitle="Changing passwords is coming soon" />
        <ListItem icon={<Smartphone size={18} />} title="This device" subtitle={`ID ${deviceId.slice(0, 8)}…`} value={<span className="badge badge-success">Active</span>} />
      </ListGroup>
      <ListGroup>
        <ListItem icon={<LogOut size={18} />} title="Log out" danger onClick={() => void logout()} />
        <ListItem icon={<Trash2 size={18} />} title="Delete account" subtitle="Contact support to permanently delete your data" danger />
      </ListGroup>
    </Section>
  );
}

/* ---------------------------------------------------------------- appearance */

const THEMES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "black", label: "Black", icon: CircleOff },
];

function resizeToDataUrl(file: File, max = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Couldn’t read that image"));
    img.src = url;
  });
}

function AppearanceSection() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onPhoto = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const data = await resizeToDataUrl(f);
      s.set({ wallpaperPhoto: data, wallpaper: "photo" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t use that image");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <Section title="Appearance" subtitle="Make Secrets feel like yours">
      <div className="appearance-preview" style={wallpaperStyle(s.wallpaper, s.wallpaperPhoto)} aria-hidden>
        <div className="ap-bubble">Did you change the colors? 👀</div>
        <div className="ap-bubble is-mine">New accent, who dis ✨</div>
        <div className="ap-bubble">It looks so good.</div>
      </div>

      <div className="settings-block">
        <h3 className="list-group-title">Theme</h3>
        <div className="theme-grid" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={s.theme === t.id} className={`theme-opt ${s.theme === t.id ? "is-active" : ""}`} onClick={() => s.set({ theme: t.id })}>
              <span className={`theme-thumb theme-thumb-${t.id}`}>
                <span />
                <span />
                <span />
              </span>
              <span className="row" style={{ gap: 6, justifyContent: "center" }}>
                <t.icon size={14} /> {t.label}
              </span>
            </button>
          ))}
        </div>
        <p className="faint settings-note">Black uses true black for OLED screens — easier on battery at night.</p>
      </div>

      <div className="settings-block">
        <h3 className="list-group-title">Accent color</h3>
        <AccentSwatches value={s.accent} onChange={(id) => s.set({ accent: id })} size={36} />
      </div>

      <div className="settings-block">
        <h3 className="list-group-title">Chat wallpaper</h3>
        <div className="wall-grid">
          {WALLPAPERS.map((w) => (
            <button key={w.id} className={`wall-opt ${s.wallpaper === w.id ? "is-active" : ""}`} onClick={() => s.set({ wallpaper: w.id })} aria-pressed={s.wallpaper === w.id}>
              <span className="wall-thumb" style={{ background: `${w.css}, var(--surface-0)` }} />
              <span>{w.name}</span>
              {s.wallpaper === w.id && <Check size={14} className="wall-check" />}
            </button>
          ))}
          <button className={`wall-opt ${s.wallpaper === "photo" ? "is-active" : ""}`} onClick={() => (s.wallpaperPhoto && s.wallpaper !== "photo" ? s.set({ wallpaper: "photo" }) : fileRef.current?.click())}>
            <span className="wall-thumb wall-thumb-photo" style={s.wallpaperPhoto ? { backgroundImage: `url(${s.wallpaperPhoto})` } : undefined}>
              {!s.wallpaperPhoto && <ImagePlus size={20} />}
            </span>
            <span>{busy ? "Loading…" : "Photo"}</span>
            {s.wallpaper === "photo" && <Check size={14} className="wall-check" />}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
        {s.wallpaperPhoto && (
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              Choose another photo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => s.set({ wallpaperPhoto: null, wallpaper: s.wallpaper === "photo" ? "default" : s.wallpaper })}>
              Remove photo
            </Button>
          </div>
        )}
        <p className="faint settings-note">Photo wallpapers stay on this device.</p>
      </div>

      <div className="settings-block">
        <h3 className="list-group-title">Font</h3>
        <div className="font-grid">
          {FONTS.map((f) => (
            <button key={f.id} className={`font-opt ${s.font === f.id ? "is-active" : ""}`} onClick={() => s.set({ font: f.id })} aria-pressed={s.font === f.id}>
              <span className="font-sample" style={{ fontFamily: f.stack }}>
                Aa
              </span>
              <span className="col" style={{ gap: 2, textAlign: "left" }}>
                <strong>{f.name}</strong>
                <span className="faint">{f.note}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <ListGroup title="Behavior">
        <ListItem title="24-hour time" subtitle="Show 18:30 instead of 6:30 PM" trailing={<Toggle label="24-hour time" checked={s.clock24} onChange={(v) => s.set({ clock24: v })} />} as="div" />
        <ListItem title="Enter to send" subtitle="Shift + Enter adds a new line" trailing={<Toggle label="Enter to send" checked={s.enterToSend} onChange={(v) => s.set({ enterToSend: v })} />} as="div" />
        <ListItem title="Reduce motion" subtitle="Tone down animations" trailing={<Toggle label="Reduce motion" checked={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })} />} as="div" />
      </ListGroup>
    </Section>
  );
}

/* ---------------------------------------------------------------- notifications */

function NotificationsSection() {
  const notif = useSettings((s) => s.notif);
  const setNotif = useSettings((s) => s.setNotif);
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");
  const row = (key: keyof typeof notif, title: string, subtitle: string) => (
    <ListItem as="div" title={title} subtitle={subtitle} trailing={<Toggle label={title} checked={notif[key]} onChange={(v) => setNotif({ [key]: v })} />} />
  );
  return (
    <Section title="Notifications" subtitle="Choose what reaches you">
      {perm !== "granted" && typeof Notification !== "undefined" && (
        <div className="settings-callout">
          <Bell size={20} />
          <div className="col grow" style={{ gap: 2 }}>
            <strong>Turn on desktop alerts</strong>
            <span className="faint">{perm === "denied" ? "Alerts are blocked in your browser settings." : "Get notified when someone messages you."}</span>
          </div>
          {perm === "default" && (
            <Button size="sm" onClick={() => void Notification.requestPermission().then(setPerm)}>
              Allow
            </Button>
          )}
        </div>
      )}
      <ListGroup title="Alerts">
        {row("messages", "Direct messages & groups", "New messages from people you chat with")}
        {row("docks", "Docks", "Mentions and replies in your docks")}
        {row("calls", "Calls", "Incoming voice and video calls")}
      </ListGroup>
      <ListGroup title="Style" footer="These preferences are saved on this device.">
        {row("previews", "Show message previews", "Hide text to keep things private on shared screens")}
        {row("sounds", "Sounds", "Play a soft chime for new messages")}
      </ListGroup>
    </Section>
  );
}

/* ---------------------------------------------------------------- privacy */

function PrivacySection() {
  const privacy = useSettings((s) => s.privacy);
  const setPrivacy = useSettings((s) => s.setPrivacy);
  const row = (key: keyof typeof privacy, title: string, subtitle: string) => (
    <ListItem as="div" title={title} subtitle={subtitle} trailing={<Toggle label={title} checked={privacy[key]} onChange={(v) => setPrivacy({ [key]: v })} />} />
  );
  return (
    <Section title="Privacy & security" subtitle="You decide what others see">
      <div className="settings-callout is-accent">
        <Shield size={20} />
        <div className="col grow" style={{ gap: 2 }}>
          <strong>End-to-end encryption is rolling out</strong>
          <span className="faint">Messages already travel in sealed envelopes; device keys are next, so only the people in a chat can read it.</span>
        </div>
      </div>
      <ListGroup title="Activity">
        {row("readReceipts", "Read receipts", "Let people know when you’ve read their messages")}
        {row("typing", "Typing indicator", "Show “typing…” while you write")}
        {row("onlineStatus", "Online status", "Show when you’re active")}
      </ListGroup>
      <ListGroup title="Profile" footer="Some controls apply on this device only while server-side privacy settings are in progress.">
        {row("profilePreview", "Public profile link", "Allow anyone with your link to view your profile")}
      </ListGroup>
    </Section>
  );
}

/* ---------------------------------------------------------------- help */

function HelpSection() {
  const resetCoach = useSettings((s) => s.resetCoach);
  const nav = useNavigate();
  return (
    <Section title="Help & about">
      <div className="about-card">
        <Ghost size={92} float />
        <div className="col" style={{ gap: 4 }}>
          <strong className="about-name">Secrets</strong>
          <span className="faint">Your world. Your people. Your space.</span>
          <span className="badge badge-neutral" style={{ alignSelf: "flex-start" }}>
            Version 0.1.0 · web
          </span>
        </div>
      </div>
      <ListGroup title="Get help">
        <ListItem
          icon={<Lightbulb size={18} />}
          title="Show tips again"
          subtitle="Replay the quick tour of the app"
          onClick={() => {
            resetCoach();
            toast.success("Tips will show again");
            nav("/chats");
          }}
          chevron
        />
        <ListItem icon={<Sparkles size={18} />} title="Ask the Secrets assistant" subtitle="Questions about the app, answered in-chat" chevron onClick={() => nav("/ai")} />
        <ListItem icon={<LifeBuoy size={18} />} title="Message the Secrets team" subtitle="Say hi in Secrets HQ" chevron onClick={() => nav("/docks")} />
      </ListGroup>
      <ListGroup title="About">
        <ListItem icon={<Info size={18} />} title="What’s new" subtitle="Docks, moments, calls and the assistant" />
        <ListItem icon={<Shield size={18} />} title="Privacy" subtitle="We don’t sell your data or read your chats" />
      </ListGroup>
      <p className="faint settings-note" style={{ textAlign: "center" }}>
        Secure. Private. Together.
      </p>
    </Section>
  );
}

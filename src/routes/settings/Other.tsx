import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AtSign, Check, ChevronRight, Eye, Mail, X } from "lucide-react";
import type { MomentSettings as StorySettings, MomentVisibility } from "@shared";
import { useSettings } from "../../stores/settings";
import { useSession } from "../../stores/session";
import { toast } from "../../stores/toast";
import { errorMessage } from "../../lib/api";
import { momentsApi } from "../../lib/features/api";
import { FONTS } from "../../lib/theme";
import { Avatar, Group, PillButton, Radio, Row, Screen, ScreenBody, ScreenHeader, SectionLabel, Sheet, Switch, SwitchRow, TipBubble } from "../../ui";
import { PeoplePicker } from "../moments/MomentSettings";
import { APP_VERSION, LANGUAGES } from "./shared";
import { haptic } from "./Appearance";

function CheckDot() {
  return (
    <span className="bp-check" aria-hidden>
      <Check strokeWidth={3} />
    </span>
  );
}

/** Fonts (blueprint p11). */
export function FontsScreen() {
  const font = useSettings((s) => s.font);
  return (
    <Screen label="Fonts">
      <ScreenHeader title="Fonts" size="lg" back="/settings" />
      <ScreenBody>
        <p className="ft-intro">Changes the font of Secrets’s menus, messages and notes on this device. Letters a font doesn’t have use your phone’s font.</p>
        <div className="ft-list" role="radiogroup" aria-label="Fonts">
          {FONTS.map((f) => (
            <button key={f.id} role="radio" aria-checked={font === f.id} className="ft-opt" style={{ fontFamily: f.stack }} onClick={() => (haptic(), useSettings.getState().set({ font: f.id }))}>
              <span className="ft-main">
                <span className="ft-name">{f.name}</span>
                <span className="ft-sample">The quick brown fox jumps over the lazy dog.</span>
                <span className="ft-note">{f.note}</span>
              </span>
              {font === f.id && <CheckDot />}
            </button>
          ))}
        </div>
      </ScreenBody>
    </Screen>
  );
}

const STORY_OPTIONS: { id: MomentVisibility; label: string; sub: string; pick?: boolean }[] = [
  { id: "all_friends", label: "All Friends", sub: "All your friends can view" },
  { id: "public", label: "Public", sub: "Friends and Dock members can view" },
  { id: "only", label: "Only These People", sub: "Choose who can view", pick: true },
  { id: "except", label: "All Friends Except", sub: "Hide from specific friends", pick: true },
];

/** My Story privacy + enable toggle with preview (blueprint p12, tip p28). */
export function StoriesScreen() {
  const enabled = useSettings((s) => s.storiesEnabled);
  const seenTip = useSettings((s) => !!s.coachSeen["story-preview"]);
  const [s, setS] = useState<StorySettings | null>(null);
  const [picking, setPicking] = useState<MomentVisibility | null>(null);
  const [preview, setPreview] = useState(false);
  const eyeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    momentsApi.settings().then(setS, (e) => toast.error(errorMessage(e)));
  }, []);

  const save = async (next: StorySettings) => {
    const prev = s;
    setS(next);
    try {
      setS(await momentsApi.saveSettings(next));
    } catch (e) {
      setS(prev);
      toast.error(errorMessage(e));
    }
  };

  const vis = s?.visibility ?? "all_friends";
  return (
    <Screen label="My Story" className="st-screen">
      <ScreenHeader title="My Story" size="xl" icon="arrow" divider={false} back="/settings" />
      <ScreenBody flush>
        <h2 className="st-h">Who can view this story</h2>
        <div role="radiogroup" aria-label="Who can view this story" className="st-opts">
          {STORY_OPTIONS.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={vis === o.id}
              className="st-opt"
              disabled={!s}
              onClick={() => {
                haptic();
                if (o.pick) setPicking(o.id);
                else if (s) void save({ ...s, visibility: o.id, user_ids: [] });
              }}
            >
              <Radio checked={vis === o.id} />
              <span className="st-main">
                <span className="st-title">{o.label}</span>
                <span className="st-sub">{o.pick && vis === o.id && s ? `${s.user_ids.length} ${s.user_ids.length === 1 ? "person" : "people"}` : o.sub}</span>
              </span>
              {o.pick && <ChevronRight className="st-chev" aria-hidden />}
            </button>
          ))}
        </div>
        <p className="st-desc">Choose who can view your story. Changes do not affect stories you have already shared. Blocked users can never view your stories.</p>
        <hr className="st-hr" />
        <h2 className="st-h">Story availability</h2>
        <div className="st-enable">
          <div className="st-main">
            <span className="st-title">Enable stories</span>
            <span className="st-sub">Show the stories tray and allow new stories</span>
          </div>
          <button ref={eyeRef} className="st-eye" aria-label="Preview Chats with and without stories" onClick={() => setPreview(true)}>
            <Eye />
          </button>
          <Switch checked={enabled} onChange={(v) => (haptic(), useSettings.getState().set({ storiesEnabled: v }))} label="Enable stories" />
        </div>
      </ScreenBody>

      {!seenTip && !preview && <TipBubble target={eyeRef} title="Preview it first" body="See how Chats looks with stories on and off before you choose." onDone={() => useSettings.getState().markCoach("story-preview")} single />}

      <Sheet open={!!picking} onClose={() => setPicking(null)} title="Choose people">
        {picking && s && (
          <PeoplePicker
            title={picking === "only" ? "Only these people can view" : "Hide my story from"}
            initial={s.visibility === picking ? s.user_ids : []}
            onCancel={() => setPicking(null)}
            onDone={(ids) => {
              void save({ ...s, visibility: picking, user_ids: ids });
              setPicking(null);
            }}
          />
        )}
      </Sheet>
      <StoryPreview open={preview} onClose={() => setPreview(false)} />
    </Screen>
  );
}

function StoryPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const enabled = useSettings((s) => s.storiesEnabled);
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    if (open) setOn(enabled);
  }, [open, enabled]);
  const people = ["Mia", "Leo", "Zara", "Kai", "Noor"];
  return (
    <Sheet open={open} onClose={onClose} title="Preview">
      <h3 className="sheet-h">Preview</h3>
      <div className="sp-seg" role="tablist" aria-label="Stories">
        <button role="tab" aria-selected={on} className={on ? "is-on" : ""} onClick={() => setOn(true)}>
          Stories on
        </button>
        <button role="tab" aria-selected={!on} className={!on ? "is-on" : ""} onClick={() => setOn(false)}>
          Stories off
        </button>
      </div>
      <div className="sp-phone" aria-hidden>
        <div className="sp-top">Chats</div>
        {on && (
          <div className="sp-tray">
            {people.map((p, i) => (
              <span key={p} className="sp-story">
                <span className={`sp-ring ${i === 0 ? "me" : ""}`}>
                  <Avatar name={p} seed={p} size={40} />
                </span>
                <span>{i === 0 ? "My story" : p}</span>
              </span>
            ))}
          </div>
        )}
        {people.slice(1).map((p) => (
          <div key={p} className="sp-chat">
            <Avatar name={p} seed={p} size={38} />
            <span className="sp-lines">
              <b>{p}</b>
              <i />
            </span>
          </div>
        ))}
      </div>
      <div className="sheet-actions">
        <PillButton
          onClick={() => {
            useSettings.getState().set({ storiesEnabled: on });
            onClose();
          }}
        >
          {on ? "Keep stories on" : "Turn stories off"}
        </PillButton>
      </div>
    </Sheet>
  );
}

/** App language (blueprint p15–16). */
export function LanguageScreen() {
  const language = useSettings((s) => s.language);
  return (
    <Screen label="App language">
      <ScreenHeader title="App language" size="lg" divider={false} back="/settings" />
      <ScreenBody flush>
        <p className="lg-intro">Changes Secrets’s menus and buttons on this device. Messages and names stay as they were written.</p>
        <div role="radiogroup" aria-label="App language" className="lg-list">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={language === l.id}
              lang={l.id}
              className="lg-opt"
              onClick={() => {
                if (!l.enabled) return toast.info(`${l.name} is coming soon`);
                useSettings.getState().set({ language: l.id });
              }}
            >
              <span className="lg-main">
                <span className="lg-native">{l.native}</span>
                {l.native !== l.name && <span className="lg-name">{l.name}</span>}
              </span>
              {language === l.id && <CheckDot />}
            </button>
          ))}
        </div>
      </ScreenBody>
    </Screen>
  );
}

/** Help (blueprint p14). */
export function HelpScreen() {
  const nav = useNavigate();
  const resetCoach = useSettings((s) => s.resetCoach);
  const items: [string, () => void][] = [
    ["What’s new", () => nav("/whats-new")],
    ["Support center", () => nav("/ai")],
    ["Contact us", () => (window.location.href = "mailto:hello@secrets.app")],
    ["Privacy Policy", () => toast.info("We don’t sell your data or read your chats.")],
    ["Terms of Service", () => toast.info("Be kind, keep it legal, respect privacy.")],
    [
      "Show tips again",
      () => {
        resetCoach();
        toast.success("Tips will show again");
        nav("/chats");
      },
    ],
  ];
  return (
    <Screen label="Help">
      <ScreenHeader title="Help" size="lg" divider={false} back="/settings" />
      <ScreenBody flush>
        <div className="hp-list">
          {items.map(([label, go]) => (
            <button key={label} className="hp-row" onClick={go}>
              {label}
            </button>
          ))}
        </div>
        <div className="hp-foot">
          <strong>Secrets v{APP_VERSION}</strong>
          <span>Icons by Lucide, licensed under ISC</span>
        </div>
      </ScreenBody>
    </Screen>
  );
}

/** Add account (blueprint p13). */
export function AddAccountScreen() {
  const nav = useNavigate();
  return (
    <Screen label="Add account" className="aa-screen">
      <header className="bp-header no-divider">
        <button className="bp-back" aria-label="Close" onClick={() => nav("/settings")}>
          <X />
        </button>
      </header>
      <ScreenBody>
        <h1 className="aa-title">Add account</h1>
        <p className="aa-sub">You stay logged in to the account you’re using.</p>
        <div className="aa-btns">
          <button className="aa-btn" onClick={() => toast.info("Google sign-in is available on the Welcome screen")}>
            <GoogleG /> Continue with Google
          </button>
          <button className="aa-btn" onClick={() => toast.info("Adding a second account is coming soon")}>
            <Mail /> Continue with email
          </button>
          <button className="aa-btn" onClick={() => toast.info("Adding a second account is coming soon")}>
            <AtSign /> Continue with username
          </button>
        </div>
      </ScreenBody>
    </Screen>
  );
}

export function GoogleG() {
  return (
    <svg className="gg" viewBox="0 0 48 48" width="20" height="20" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ restyled sections (closest blueprint pattern: p5 groups) */

export function PrivacyScreen() {
  const p = useSettings((s) => s.privacy);
  const set = useSettings((s) => s.setPrivacy);
  return (
    <Screen label="Privacy">
      <ScreenHeader title="Privacy" back="/settings" />
      <ScreenBody>
        <Group label="Activity">
          <SwitchRow title="Read receipts" sub="Let people know when you’ve read their messages" checked={p.readReceipts} onChange={(v) => set({ readReceipts: v })} />
          <SwitchRow title="Typing indicator" sub="Show “typing…” while you write" checked={p.typing} onChange={(v) => set({ typing: v })} />
          <SwitchRow title="Online status" sub="Show when you’re active" checked={p.onlineStatus} onChange={(v) => set({ onlineStatus: v })} />
        </Group>
        <SectionLabel>Profile</SectionLabel>
        <Group label="Profile">
          <SwitchRow title="Public profile link" sub="Anyone with your link can view your profile" checked={p.profilePreview} onChange={(v) => set({ profilePreview: v })} />
          <Row title="Stories" sub="Who can view your story" to="/settings/stories" />
        </Group>
        <p className="bp-foot">Messages travel in sealed envelopes. Device keys are next, so only the people in a chat can read it.</p>
      </ScreenBody>
    </Screen>
  );
}

export function NotificationsScreen() {
  const n = useSettings((s) => s.notif);
  const set = useSettings((s) => s.setNotif);
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");
  return (
    <Screen label="Notifications">
      <ScreenHeader title="Notifications" back="/settings" />
      <ScreenBody>
        {perm === "default" && (
          <Group label="Desktop alerts">
            <Row title="Turn on alerts" sub="Get notified when someone messages you" chevron onClick={() => void Notification.requestPermission().then(setPerm)} />
          </Group>
        )}
        <SectionLabel>Alerts</SectionLabel>
        <Group label="Alerts">
          <SwitchRow title="Messages" sub="Direct messages and groups" checked={n.messages} onChange={(v) => set({ messages: v })} />
          <SwitchRow title="Docks" sub="Mentions and replies" checked={n.docks} onChange={(v) => set({ docks: v })} />
          <SwitchRow title="Calls" sub="Incoming voice and video calls" checked={n.calls} onChange={(v) => set({ calls: v })} />
        </Group>
        <SectionLabel>Style</SectionLabel>
        <Group label="Style">
          <SwitchRow title="Message previews" sub="Show the text in alerts" checked={n.previews} onChange={(v) => set({ previews: v })} />
          <SwitchRow title="Sounds" sub="A soft chime for new messages" checked={n.sounds} onChange={(v) => set({ sounds: v })} />
        </Group>
        <p className="bp-foot">These preferences are saved on this device.</p>
      </ScreenBody>
    </Screen>
  );
}

function storageBytes() {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      n += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
  } catch {
    /* ignore */
  }
  return n * 2;
}
const fmt = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export function StorageScreen() {
  const s = useSettings();
  const user = useSession((u) => u.user);
  const [bytes, setBytes] = useState(storageBytes);
  return (
    <Screen label="Storage">
      <ScreenHeader title="Storage" back="/settings" />
      <ScreenBody>
        <Group label="Usage">
          <Row title="On this device" value={fmt(bytes)} disabled />
          <Row title="Wallpaper photo" value={s.wallpaperPhoto ? fmt(s.wallpaperPhoto.length) : "None"} disabled />
        </Group>
        <Group label="Actions">
          <SwitchRow title="Enter to send" sub="Shift + Enter adds a new line" checked={s.enterToSend} onChange={(v) => s.set({ enterToSend: v })} />
          <SwitchRow title="Reduce motion" sub="Tone down animations" checked={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })} />
          <Row
            title="Clear wallpaper photo"
            danger
            disabled={!s.wallpaperPhoto}
            onClick={() => {
              s.set({ wallpaperPhoto: null, wallpaper: s.wallpaper === "photo" ? "default" : s.wallpaper });
              setTimeout(() => setBytes(storageBytes()), 0);
              toast.success("Photo removed");
            }}
          />
        </Group>
        <p className="bp-foot">Signed in as @{user?.username}. Chats stay in your account; clearing device data never deletes messages.</p>
      </ScreenBody>
    </Screen>
  );
}

import { useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, Check, Clock, Contrast, FlaskConical, Grip, ImagePlus, Laptop, NotebookPen, Palette, Plus, RotateCw, Cloud, X } from "lucide-react";
import { useSettings } from "../../stores/settings";
import { toast } from "../../stores/toast";
import { GRADIENT_ACCENTS, SOLID_ACCENTS, WALLPAPERS, accentCss, customAccent, findAccent, type ThemeMode } from "../../lib/theme";
import { Group, Radio, Row, Screen, ScreenBody, ScreenHeader, Switch } from "../../ui";
import { GraceIcon } from "./shared";

export const THEME_LABEL: Record<ThemeMode, string> = { system: "System default", light: "Light", dark: "Dark", black: "Black" };

export function haptic(ms = 8) {
  if (useSettings.getState().haptics && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* unsupported */
    }
  }
}

/** Appearance (blueprint p10). */
export function AppearanceScreen() {
  const s = useSettings();
  const a = findAccent(s.accent);
  return (
    <Screen label="Appearance">
      <ScreenHeader title="Appearance" back="/settings" />
      <ScreenBody>
        <Group label="Appearance">
          <Row icon={<Contrast />} title="Theme" value={THEME_LABEL[s.theme]} to="/settings/appearance/theme" chevron />
          <Row icon={<Palette />} title="Colors" value={<span className="ap-dot" style={{ background: accentCss(a) }} aria-label={a.name} />} to="/settings/appearance/colors" chevron />
          <Row icon={<Clock />} title="Clock format" value={s.clock24 ? "24-hour" : "12-hour"} to="/settings/appearance/clock" chevron />
          <Row icon={<Activity />} title="Haptics" value={s.haptics ? "On" : "Off"} to="/settings/appearance/haptics" chevron />
          <Row icon={<Grip />} title="App icon" value={s.appIcon === "ghost" ? "Secrets Ghost" : "Secrets"} to="/settings/appearance/app-icon" chevron />
        </Group>
        <Group label="Experiments">
          <div className="bp-row two iconed ap-exp" onClick={() => s.set({ newChatScreen: !s.newChatScreen })}>
            <span className="bp-ic" aria-hidden>
              <FlaskConical />
            </span>
            <span className="bp-main">
              <span className="bp-title" style={{ display: "block" }}>
                New chat screen
              </span>
              <span className="bp-sub" style={{ display: "block" }}>
                Being built: chats and docks open at your first unread message, and jumps to a message land in one step.
              </span>
            </span>
            <Switch checked={s.newChatScreen} onChange={(v) => s.set({ newChatScreen: v })} label="New chat screen" />
          </div>
        </Group>
      </ScreenBody>
    </Screen>
  );
}

function RadioScreen<T extends string | boolean>({ title, options, value, onPick }: { title: string; options: { id: T; label: string; sub?: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <Screen label={title}>
      <ScreenHeader title={title} back="/settings/appearance" />
      <ScreenBody>
        <div className="bp-group" role="radiogroup" aria-label={title}>
          {options.map((o) => (
            <Row key={String(o.id)} role="radio" checked={value === o.id} title={o.label} sub={o.sub} trailing={<Radio checked={value === o.id} />} onClick={() => (haptic(), onPick(o.id))} />
          ))}
        </div>
      </ScreenBody>
    </Screen>
  );
}

/** Theme (blueprint p8). */
export function ThemeScreen() {
  const theme = useSettings((s) => s.theme);
  return (
    <RadioScreen<ThemeMode>
      title="Theme"
      value={theme}
      onPick={(t) => useSettings.getState().set({ theme: t })}
      options={[
        { id: "system", label: "System default" },
        { id: "light", label: "Light" },
        { id: "dark", label: "Dark" },
        { id: "black", label: "Black", sub: "True black for OLED screens" },
      ]}
    />
  );
}

/** Clock format — not in the blueprint; uses the Theme radio pattern (p8). */
export function ClockScreen() {
  const clock24 = useSettings((s) => s.clock24);
  return (
    <RadioScreen<boolean>
      title="Clock format"
      value={clock24}
      onPick={(v) => useSettings.getState().set({ clock24: v })}
      options={[
        { id: false, label: "12-hour", sub: "6:30 PM" },
        { id: true, label: "24-hour", sub: "18:30" },
      ]}
    />
  );
}

/** Haptics — not in the blueprint; uses the Theme radio pattern (p8). */
export function HapticsScreen() {
  const haptics = useSettings((s) => s.haptics);
  return (
    <RadioScreen<boolean>
      title="Haptics"
      value={haptics}
      onPick={(v) => {
        useSettings.getState().set({ haptics: v });
        if (v) haptic(14);
      }}
      options={[
        { id: true, label: "On", sub: "A light tap when you press buttons and switches" },
        { id: false, label: "Off" },
      ]}
    />
  );
}

/** Accent color (blueprint p7): solids, gradients, my colors and a live preview. */
export function ColorsScreen() {
  const s = useSettings();
  const current = findAccent(s.accent);
  const picker = useRef<HTMLInputElement>(null);
  const pick = (id: string) => (haptic(), s.set({ accent: id }));
  const addCustom = (hex: string) => {
    const h = hex.toLowerCase();
    if (!s.myColors.includes(h)) s.set({ myColors: [...s.myColors, h].slice(-12) });
    pick(`custom:${h}`);
  };
  const sw = (id: string, css: string, name: string, big?: boolean) => (
    <button
      key={id}
      role="radio"
      aria-checked={s.accent === id}
      aria-label={name}
      className={`ac-sw ${big ? "big" : ""} ${s.accent === id ? "is-on" : ""}`}
      style={{ background: css } as CSSProperties}
      onClick={() => pick(id)}
    />
  );
  return (
    <Screen label="Accent color">
      <ScreenHeader title="Accent color" back="/settings/appearance" />
      <ScreenBody className="ac-body">
        <h2 className="ac-h">Solids</h2>
        <div className="ac-grid" role="radiogroup" aria-label="Solids">
          {SOLID_ACCENTS.map((a) => sw(a.id, accentCss(a), a.name))}
        </div>
        <h2 className="ac-h">Gradients</h2>
        <div className="ac-grid big" role="radiogroup" aria-label="Gradients">
          {GRADIENT_ACCENTS.map((a) => sw(a.id, accentCss(a), a.name, true))}
        </div>
        <h2 className="ac-h">My Colors</h2>
        <div className="ac-grid" role="radiogroup" aria-label="My Colors">
          {s.myColors.map((hex) => {
            const a = customAccent(hex);
            return sw(a.id, hex, `Custom ${hex}`);
          })}
          <button className="ac-add" aria-label="Add a color" onClick={() => picker.current?.click()}>
            <Plus />
          </button>
          <input ref={picker} type="color" className="sr-only" tabIndex={-1} aria-hidden defaultValue="#9673ff" onChange={(e) => addCustom(e.target.value)} />
        </div>
        <hr className="ac-hr" />
        <div className="ac-preview" aria-label="Preview">
          <span className="ac-pav" style={{ background: accentCss(current) }} />
          <div className="ac-pcol">
            <span className="ac-plabel">Preview</span>
            <span className="ac-bubble">Hello there! 👋</span>
          </div>
          <button className="ac-reset" onClick={() => pick(GRADIENT_ACCENTS[0].id)}>
            <RotateCw aria-hidden /> Reset
          </button>
        </div>
      </ScreenBody>
    </Screen>
  );
}

/** App icon (blueprint p9). */
export function AppIconScreen() {
  const s = useSettings();
  const nav = useNavigate();
  const [tray, setTray] = useState(true);
  const opts = [
    { id: "default" as const, title: "Secrets", sub: "Default", img: "/logo-mark.png" },
    { id: "ghost" as const, title: "Secrets Ghost", sub: "The ghost glowing on black", img: "/ghost.webp" },
  ];
  return (
    <Screen label="App icon" className="ai-screen">
      <ScreenHeader title="App icon" back="/settings/appearance" />
      <ScreenBody>
        <div className="bp-group" role="radiogroup" aria-label="App icon">
          {opts.map((o) => (
            <Row
              key={o.id}
              role="radio"
              checked={s.appIcon === o.id}
              className="ai-row"
              icon={
                <span className={`ai-tile ${o.id}`}>
                  <img src={o.img} alt="" />
                </span>
              }
              title={o.title}
              sub={o.sub}
              trailing={<Radio checked={s.appIcon === o.id} />}
              onClick={() => {
                haptic();
                s.set({ appIcon: o.id });
                setAppIcon(o.id);
              }}
            />
          ))}
        </div>
      </ScreenBody>
      {tray && (
        <div className="ai-tray" role="toolbar" aria-label="Quick actions">
          <span className="ai-thumb" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span className="t" />
          </span>
          <button className="ai-act" onClick={() => nav("/notes")}>
            <NotebookPen />
            <span>Note</span>
          </button>
          <button className="ai-act" onClick={() => nav("/vault")}>
            <Cloud className="ai-drive" />
            <span>Drive</span>
          </button>
          <button className="ai-act" onClick={() => nav("/ai")}>
            <GraceIcon />
            <span>Grace</span>
          </button>
          <button className="ai-act" onClick={() => nav("/home")}>
            <Laptop />
            <span>Computer</span>
          </button>
          <button className="ai-close" aria-label="Close quick actions" onClick={() => setTray(false)}>
            <X />
          </button>
        </div>
      )}
    </Screen>
  );
}

/** Swap the favicon / touch icon so the browser tab follows the chosen app icon. */
export function setAppIcon(id: "default" | "ghost") {
  const href = id === "ghost" ? "/ghost-128.png" : "/brand/logo-mark.png";
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => (l.href = href));
}

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

/** Chat wallpaper (blueprint p6). */
export function WallpaperScreen() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const onPhoto = async (f?: File) => {
    if (!f) return;
    try {
      const data = await resizeToDataUrl(f);
      s.set({ wallpaperPhoto: data, wallpaper: "photo" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t use that image");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const tile = (id: string, name: string, bg: string, extra?: React.ReactNode) => (
    <button key={id} role="radio" aria-checked={s.wallpaper === id} aria-label={name} className={`wp-tile ${s.wallpaper === id ? "is-on" : ""}`} style={{ background: bg }} onClick={() => (haptic(), s.set({ wallpaper: id }))}>
      {extra}
      {s.wallpaper === id && (
        <span className="wp-check" aria-hidden>
          <Check strokeWidth={3} />
        </span>
      )}
      <span className="wp-name">{name}</span>
    </button>
  );
  return (
    <Screen label="Chat wallpaper">
      <ScreenHeader title="Chat wallpaper" back="/settings/appearance" />
      <ScreenBody>
        <p className="wp-intro">For all your chats on this device. A chat can have its own from its ⋮ menu.</p>
        <div className="wp-grid" role="radiogroup" aria-label="Wallpapers">
          {tile("default", "Default", WALLPAPERS[0].css + ", #0b0b0f")}
          <button
            className={`wp-tile wp-photo ${s.wallpaper === "photo" ? "is-on" : ""}`}
            role="radio"
            aria-checked={s.wallpaper === "photo"}
            style={s.wallpaperPhoto ? { backgroundImage: `url(${s.wallpaperPhoto})`, backgroundSize: "cover" } : undefined}
            onClick={() => (s.wallpaperPhoto && s.wallpaper !== "photo" ? s.set({ wallpaper: "photo" }) : fileRef.current?.click())}
          >
            {!s.wallpaperPhoto && (
              <span className="wp-photo-in">
                <ImagePlus />
                Your photo
              </span>
            )}
            {s.wallpaper === "photo" && (
              <span className="wp-check" aria-hidden>
                <Check strokeWidth={3} />
              </span>
            )}
          </button>
          {WALLPAPERS.slice(1).map((w) => tile(w.id, w.name, w.css))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
        {s.wallpaperPhoto && (
          <p className="wp-intro" style={{ marginTop: 14 }}>
            Photo wallpapers stay on this device.{" "}
            <Link to="#" onClick={(e) => (e.preventDefault(), s.set({ wallpaperPhoto: null, wallpaper: s.wallpaper === "photo" ? "default" : s.wallpaper }))}>
              Remove photo
            </Link>
          </p>
        )}
      </ScreenBody>
    </Screen>
  );
}

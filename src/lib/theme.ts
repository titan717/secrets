export type ThemeMode = "system" | "light" | "dark" | "black";

export interface Accent {
  id: string;
  name: string;
  /** primary color (top stop for gradients) */
  c1: string;
  /** second stop for gradients; equals c1 for solids */
  c2: string;
  gradient?: boolean;
  /** Follows the theme: white on dark themes, black on light. */
  mono?: boolean;
  /** Readable tint for text/icons, per theme family. Falls back to an automatic AA-safe tint. */
  ink?: { dark: string; light: string };
}

/** Blueprint p7 "Solids", in order (6 per row). */
export const SOLID_ACCENTS: Accent[] = [
  { id: "mono", name: "Default", c1: "#ffffff", c2: "#444444", mono: true },
  { id: "coral", name: "Coral", c1: "#fc5656", c2: "#fc5656" },
  { id: "orange", name: "Orange", c1: "#ff9a14", c2: "#ff9a14" },
  { id: "yellow", name: "Yellow", c1: "#fecf07", c2: "#fecf07" },
  { id: "red", name: "Red", c1: "#f92927", c2: "#f92927" },
  { id: "lime", name: "Lime", c1: "#b4f213", c2: "#b4f213" },
  { id: "green", name: "Green", c1: "#24ee7e", c2: "#24ee7e" },
  { id: "mint", name: "Mint", c1: "#0ce7af", c2: "#0ce7af" },
  { id: "teal", name: "Teal", c1: "#11e5d7", c2: "#11e5d7" },
  { id: "cyan", name: "Cyan", c1: "#0ad6fb", c2: "#0ad6fb" },
  { id: "sky", name: "Sky", c1: "#48affe", c2: "#48affe" },
  { id: "periwinkle", name: "Periwinkle", c1: "#858aff", c2: "#858aff" },
  { id: "lavender", name: "Lavender", c1: "#ba7bfe", c2: "#ba7bfe" },
  { id: "orchid", name: "Orchid", c1: "#d770ff", c2: "#d770ff" },
  { id: "blush", name: "Blush", c1: "#ffd8f5", c2: "#ffd8f5" },
  { id: "pink", name: "Pink", c1: "#fe5ccb", c2: "#fe5ccb" },
  { id: "rose", name: "Rose", c1: "#fe4e7d", c2: "#fe4e7d" },
  { id: "magenta", name: "Magenta", c1: "#e9177c", c2: "#e9177c" },
  { id: "purple", name: "Purple", c1: "#b417c0", c2: "#b417c0" },
];

/** Blueprint p7 "Gradients" (vertical, top → bottom). First = Midnight (default). */
export const GRADIENT_ACCENTS: Accent[] = [
  { id: "g-midnight", name: "Midnight", c1: "#2c3fb0", c2: "#141b5c", gradient: true, ink: { dark: "#8c9cff", light: "#1f2a82" } },
  { id: "g-secrets", name: "Secrets", c1: "#8f86ff", c2: "#d56fff", gradient: true },
  { id: "g-sun", name: "Sun", c1: "#fff016", c2: "#ffa516", gradient: true },
  { id: "g-sea", name: "Sea", c1: "#05e0f7", c2: "#40b2fd", gradient: true },
  { id: "g-spring", name: "Spring", c1: "#a4f125", c2: "#1ee7a5", gradient: true },
  { id: "g-candy", name: "Candy", c1: "#ff5ac6", c2: "#fe4e84", gradient: true },
];

export const DEFAULT_ACCENT = "g-midnight";
export const ALL_ACCENTS = [...SOLID_ACCENTS, ...GRADIENT_ACCENTS];

const HEX = /^#[0-9a-f]{6}$/i;
/** Custom colours ("My Colors") are stored as `custom:#rrggbb`. */
export const customAccent = (hex: string): Accent => ({ id: `custom:${hex.toLowerCase()}`, name: hex.toUpperCase(), c1: hex, c2: hex });

export const findAccent = (id: string | null | undefined): Accent => {
  if (id?.startsWith("custom:") && HEX.test(id.slice(7))) return customAccent(id.slice(7));
  return ALL_ACCENTS.find((a) => a.id === id) ?? GRADIENT_ACCENTS[0];
};

/** Swatch / fill CSS. Gradients run top → bottom like the blueprint swatches. */
export const accentCss = (a: Accent) =>
  a.mono ? `linear-gradient(90deg, ${a.c1} 50%, ${a.c2} 50%)` : a.gradient ? `linear-gradient(180deg, ${a.c1}, ${a.c2})` : a.c1;

/** Relative luminance (WCAG) of #rrggbb. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/**
 * Accent used for text, icons and tints: the accent itself when it reads at AA (4.5:1) on the
 * theme background, otherwise mixed toward white (dark themes) or black (light) until it does.
 */
export function accentInk(a: Accent, bg: string, light: boolean): string {
  if (a.ink) return light ? a.ink.light : a.ink.dark;
  const base = a.gradient ? mixHex(a.c1, a.c2, 0.5) : a.c1;
  const toward = light ? "#000000" : "#ffffff";
  for (let t = 0; t <= 1; t += 0.05) {
    const c = mixHex(base, toward, t);
    if (contrast(c, bg) >= 4.5) return c;
  }
  return toward;
}

/** Text colour on top of an accent fill: whichever of black/white has more contrast. */
export const onColor = (hex: string) => (contrast(hex, "#000000") >= contrast(hex, "#ffffff") ? "#000000" : "#ffffff");

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

export interface Wallpaper { id: string; name: string; css: string }
/** Chat wallpapers (blueprint p6 grid). Photo tiles are drawn with CSS so no third-party photos ship. */
export const WALLPAPERS: Wallpaper[] = [
  { id: "default", name: "Default", css: "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--text) 9%, transparent) 1px, transparent 0) 0 0 / 22px 22px" },
  { id: "space", name: "Space", css: "radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,.55), transparent), radial-gradient(1px 1px at 120px 80px, rgba(255,255,255,.4), transparent), radial-gradient(1.5px 1.5px at 60px 150px, rgba(255,255,255,.5), transparent), radial-gradient(1px 1px at 170px 170px, rgba(255,255,255,.35), transparent) 0 0 / 200px 200px, #050507" },
  { id: "anime", name: "Anime ride", css: "linear-gradient(180deg, #8ec5ff 0%, #cfe8ff 28%, #6fae5a 30%, #3f7d3a 60%, #c99a47 61%, #8a6a32 100%)" },
  { id: "cozy", name: "Cozy night", css: "radial-gradient(60px 60px at 50% 8%, rgba(255,214,150,.55), transparent 70%), linear-gradient(180deg, #1e2a55 0%, #0e1530 55%, #070a18 100%)" },
  { id: "xmas-pink", name: "Xmas pink", css: "radial-gradient(14px 40px at 30% 60%, #f6c6d0 60%, transparent 62%), radial-gradient(14px 40px at 60% 58%, #f3b8c6 60%, transparent 62%), radial-gradient(14px 40px at 85% 62%, #f6c6d0 60%, transparent 62%), linear-gradient(180deg, #fff3f4, #fbe4e8)" },
  { id: "xmas", name: "Xmas", css: "radial-gradient(10px 10px at 20% 30%, #ffe08a, transparent 70%), radial-gradient(8px 8px at 70% 20%, #ffd36b, transparent 70%), radial-gradient(9px 9px at 50% 70%, #ffcd5c, transparent 70%), radial-gradient(40px 40px at 30% 80%, #b3131b, transparent 70%), linear-gradient(160deg, #1d3b1a, #0b1a0b)" },
  { id: "cottage", name: "Snowy cottage", css: "radial-gradient(70px 50px at 50% 60%, rgba(255,190,90,.8), transparent 70%), linear-gradient(180deg, #24324f 0%, #3b3d58 45%, #d9dce6 75%, #f4f5f9 100%)" },
  { id: "window", name: "Christmas window", css: "linear-gradient(90deg, transparent 47%, #2a1a10 47% 53%, transparent 53%), radial-gradient(60px 80px at 30% 60%, rgba(255,170,80,.6), transparent 70%), linear-gradient(180deg, #2c3d66, #6a4a32)" },
  { id: "lake", name: "Starry lake", css: "radial-gradient(1px 1px at 30px 20px, #fff, transparent), radial-gradient(1px 1px at 90px 50px, #fff, transparent) 0 0 / 120px 120px, linear-gradient(180deg, #0d1240 0%, #3b2d7a 45%, #1b1f4a 55%, #0b0f2b 100%)" },
  { id: "milky", name: "Milky Way", css: "linear-gradient(120deg, transparent 35%, rgba(200,220,255,.35) 50%, transparent 65%), linear-gradient(180deg, #071a2b, #0f3a4a 70%, #0a1d1c)" },
  { id: "moon", name: "Moon", css: "radial-gradient(26px 26px at 50% 45%, #e9ecf2 60%, #9aa2b4 75%, transparent 78%), linear-gradient(180deg, #0b1220, #111a2c)" },
];

export type FontChoice = "general" | "system" | "satoshi";
/** Blueprint p11: Phone's font, then the Secrets font. */
export const FONTS: { id: FontChoice; name: string; stack: string; note: string }[] = [
  { id: "system", name: "Phone's font", stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", note: "The font you chose in your phone settings." },
  { id: "general", name: "Secrets Sans", stack: "'Inter', ui-sans-serif, system-ui, sans-serif", note: "The Secrets font, the same as the web app." },
];
export const fontStack = (id: FontChoice) => (FONTS.find((f) => f.id === id) ?? FONTS[1]).stack;

export function resolveTheme(mode: ThemeMode): "light" | "dark" | "black" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyAppearance(opts: { theme: ThemeMode; accent: string; font: FontChoice }) {
  const root = document.documentElement;
  const t = resolveTheme(opts.theme);
  root.dataset.theme = t;
  const a = findAccent(opts.accent);
  let c1 = a.c1;
  let c2 = a.c2;
  if (a.mono) c1 = c2 = t === "light" ? "#111111" : "#ffffff";
  const bg = t === "light" ? "#f2f2f7" : t === "black" ? "#000000" : "#0e0e13";
  root.style.setProperty("--accent", a.mono ? c1 : accentInk(a, bg, t === "light"));
  root.style.setProperty("--accent-solid", a.gradient ? mixHex(c1, c2, 0.5) : c1);
  root.style.setProperty("--accent-2", c2);
  root.style.setProperty("--accent-fill", a.gradient ? `linear-gradient(135deg, ${c1}, ${c2})` : c1);
  root.style.setProperty("--on-accent", onColor(a.gradient ? mixHex(c1, c2, 0.5) : c1));
  root.style.setProperty("--font-body", fontStack(opts.font));
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", bg);
}

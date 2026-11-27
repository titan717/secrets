export type ThemeMode = "system" | "light" | "dark" | "black";

export interface Accent {
  id: string;
  name: string;
  /** primary color */
  c1: string;
  /** second stop for gradients; equals c1 for solids */
  c2: string;
  gradient?: boolean;
}

export const SOLID_ACCENTS: Accent[] = [
  { id: "violet", name: "Violet", c1: "#8b5cf6", c2: "#8b5cf6" },
  { id: "orchid", name: "Orchid", c1: "#c056f5", c2: "#c056f5" },
  { id: "iris", name: "Iris", c1: "#6366f1", c2: "#6366f1" },
  { id: "sky", name: "Sky", c1: "#38a3f5", c2: "#38a3f5" },
  { id: "teal", name: "Teal", c1: "#14b8a6", c2: "#14b8a6" },
  { id: "mint", name: "Mint", c1: "#22c55e", c2: "#22c55e" },
  { id: "lime", name: "Lime", c1: "#9bd51f", c2: "#9bd51f" },
  { id: "amber", name: "Amber", c1: "#f5a524", c2: "#f5a524" },
  { id: "coral", name: "Coral", c1: "#f46a5e", c2: "#f46a5e" },
  { id: "rose", name: "Rose", c1: "#f0457f", c2: "#f0457f" },
  { id: "blush", name: "Blush", c1: "#f59ac8", c2: "#f59ac8" },
  { id: "graphite", name: "Graphite", c1: "#8d8a99", c2: "#8d8a99" },
];

export const GRADIENT_ACCENTS: Accent[] = [
  { id: "g-secrets", name: "Secrets", c1: "#a855f7", c2: "#6d28d9", gradient: true },
  { id: "g-aurora", name: "Aurora", c1: "#22d3ee", c2: "#8b5cf6", gradient: true },
  { id: "g-sunset", name: "Sunset", c1: "#fb923c", c2: "#db2777", gradient: true },
  { id: "g-bloom", name: "Bloom", c1: "#f472b6", c2: "#a855f7", gradient: true },
  { id: "g-lagoon", name: "Lagoon", c1: "#34d399", c2: "#0ea5e9", gradient: true },
  { id: "g-gold", name: "Gold", c1: "#fde047", c2: "#f97316", gradient: true },
];

export const ALL_ACCENTS = [...GRADIENT_ACCENTS, ...SOLID_ACCENTS];
export const findAccent = (id: string | null | undefined): Accent =>
  ALL_ACCENTS.find((a) => a.id === id) ?? GRADIENT_ACCENTS[0];

export const accentCss = (a: Accent) =>
  a.gradient ? `linear-gradient(135deg, ${a.c1}, ${a.c2})` : a.c1;

export interface Wallpaper { id: string; name: string; css: string }
export const WALLPAPERS: Wallpaper[] = [
  { id: "default", name: "Default", css: "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--text) 7%, transparent) 1px, transparent 0) 0 0 / 22px 22px" },
  { id: "none", name: "Plain", css: "none" },
  { id: "nebula", name: "Nebula", css: "radial-gradient(1200px 600px at 10% 0%, rgba(139,92,246,.28), transparent 60%), radial-gradient(900px 500px at 100% 100%, rgba(236,72,153,.18), transparent 60%)" },
  { id: "aurora", name: "Aurora", css: "radial-gradient(800px 400px at 80% 10%, rgba(34,211,238,.20), transparent 60%), radial-gradient(900px 600px at 0% 90%, rgba(139,92,246,.26), transparent 60%)" },
  { id: "dusk", name: "Dusk", css: "linear-gradient(180deg, rgba(76,29,149,.32), rgba(190,24,93,.14) 60%, transparent)" },
  { id: "grid", name: "Grid", css: "linear-gradient(color-mix(in oklab, var(--text) 5%, transparent) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, color-mix(in oklab, var(--text) 5%, transparent) 1px, transparent 1px) 0 0 / 28px 28px" },
  { id: "starfield", name: "Starfield", css: "radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,.55), transparent), radial-gradient(1px 1px at 120px 80px, rgba(255,255,255,.4), transparent), radial-gradient(1.5px 1.5px at 60px 150px, rgba(196,181,253,.6), transparent), radial-gradient(1px 1px at 170px 170px, rgba(255,255,255,.35), transparent) 0 0 / 200px 200px, radial-gradient(1000px 500px at 50% 120%, rgba(109,40,217,.3), transparent)" },
  { id: "moon", name: "Moon", css: "radial-gradient(60px 60px at 82% 18%, rgba(237,233,254,.55), rgba(237,233,254,.08) 60%, transparent 62%), radial-gradient(900px 600px at 82% 18%, rgba(139,92,246,.18), transparent 60%)" },
];

export type FontChoice = "general" | "satoshi" | "system";
export const FONTS: { id: FontChoice; name: string; stack: string; note: string }[] = [
  { id: "general", name: "Secrets Sans", stack: "'General Sans', ui-sans-serif, system-ui, sans-serif", note: "The Secrets typeface. Crisp and modern." },
  { id: "satoshi", name: "Satoshi", stack: "'Satoshi', ui-sans-serif, system-ui, sans-serif", note: "Softer, rounder geometry." },
  { id: "system", name: "Device font", stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", note: "Uses the font from your device settings." },
];

export function resolveTheme(mode: ThemeMode): "light" | "dark" | "black" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyAppearance(opts: { theme: ThemeMode; accent: string; font: FontChoice }) {
  const root = document.documentElement;
  const t = resolveTheme(opts.theme);
  root.dataset.theme = t;
  const a = findAccent(opts.accent);
  root.style.setProperty("--accent", a.c1);
  root.style.setProperty("--accent-2", a.c2);
  root.style.setProperty("--accent-fill", accentCss(a));
  root.style.setProperty("--font-body", (FONTS.find((f) => f.id === opts.font) ?? FONTS[0]).stack);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", t === "light" ? "#f7f6fb" : t === "black" ? "#000000" : "#0b0a10");
}

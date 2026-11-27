import { alphaOver, ensureContrast, ensureFillContrast, mix } from "./color";

export type ThemeName = "dark" | "black" | "light";
/** User-facing preference. `system` follows prefers-color-scheme (dark ↔ light). */
export type ThemePreference = ThemeName | "system";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark", "black"];
export const THEMES: readonly ThemeName[] = ["dark", "black", "light"];
export const DEFAULT_THEME: ThemeName = "dark";

/** Neutral (non-accent) semantic colors per theme. */
export interface NeutralColors {
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceHover: string;
  surfaceActive: string;
  surfaceSunken: string;
  border: string;
  /** Input borders and other UI boundaries that must hit 3:1 (WCAG 1.4.11). */
  borderStrong: string;
  text: string;
  textMuted: string;
  /** Timestamps, placeholders. Still AA (4.5:1) on every surface. */
  textSubtle: string;
  textInverse: string;
  overlay: string;
  success: string;
  successText: string;
  danger: string;
  dangerContrast: string;
  dangerText: string;
  dangerSoft: string;
  warning: string;
  warningText: string;
  warningSoft: string;
  successSoft: string;
  bubbleIn: string;
  bubbleInText: string;
  bubbleInMeta: string;
  skeleton: string;
  skeletonHighlight: string;
  scrim: string;
}

export const neutrals: Record<ThemeName, NeutralColors> = {
  dark: {
    bg: "#0B0B12",
    surface: "#11121C",
    surfaceRaised: "#171827",
    surfaceHover: "#1D1F31",
    surfaceActive: "#24263B",
    surfaceSunken: "#08080D",
    border: "#23253A",
    borderStrong: "#666987",
    text: "#EDEDF5",
    textMuted: "#A6A8BE",
    textSubtle: "#8C8FA8",
    textInverse: "#0B0B12",
    overlay: "#171827",
    success: "#22C55E",
    successText: "#4ADE80",
    successSoft: "#12261C",
    danger: "#D6343C",
    dangerContrast: "#FFFFFF",
    dangerText: "#FF7A7F",
    dangerSoft: "#2A1418",
    warning: "#F5B544",
    warningText: "#F5B544",
    warningSoft: "#2A2112",
    bubbleIn: "#1D1F31",
    bubbleInText: "#EDEDF5",
    bubbleInMeta: "#A6A8BE",
    skeleton: "#1A1C2B",
    skeletonHighlight: "#24263B",
    scrim: "rgba(4, 4, 10, 0.64)",
  },
  black: {
    bg: "#000000",
    surface: "#000000",
    surfaceRaised: "#0E0E14",
    surfaceHover: "#16161F",
    surfaceActive: "#1E1F2B",
    surfaceSunken: "#000000",
    border: "#1E1F2A",
    borderStrong: "#62657E",
    text: "#EDEDF5",
    textMuted: "#A6A8BE",
    textSubtle: "#8C8FA8",
    textInverse: "#000000",
    overlay: "#0E0E14",
    success: "#22C55E",
    successText: "#4ADE80",
    successSoft: "#0B1E14",
    danger: "#D6343C",
    dangerContrast: "#FFFFFF",
    dangerText: "#FF7A7F",
    dangerSoft: "#22100F",
    warning: "#F5B544",
    warningText: "#F5B544",
    warningSoft: "#211A0C",
    bubbleIn: "#16161F",
    bubbleInText: "#EDEDF5",
    bubbleInMeta: "#A6A8BE",
    skeleton: "#121219",
    skeletonHighlight: "#1C1C27",
    scrim: "rgba(0, 0, 0, 0.72)",
  },
  light: {
    bg: "#F6F6FA",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    surfaceHover: "#F0F0F6",
    surfaceActive: "#E8E8F1",
    surfaceSunken: "#EEEEF4",
    border: "#E2E2EC",
    borderStrong: "#8A8CA3",
    text: "#14151F",
    textMuted: "#4F5166",
    textSubtle: "#62647A",
    textInverse: "#FFFFFF",
    overlay: "#FFFFFF",
    success: "#16A34A",
    successText: "#13703A",
    successSoft: "#E7F7EC",
    danger: "#D92D3A",
    dangerContrast: "#FFFFFF",
    dangerText: "#C0202D",
    dangerSoft: "#FDECEE",
    warning: "#D97706",
    warningText: "#9A4D03",
    warningSoft: "#FDF3E2",
    bubbleIn: "#ECECF3",
    bubbleInText: "#14151F",
    bubbleInMeta: "#55576C",
    skeleton: "#ECECF2",
    skeletonHighlight: "#F6F6FA",
    scrim: "rgba(16, 16, 28, 0.40)",
  },
};

/* ---------------------------------------------------------------- accents */

export type AccentName = "violet" | "indigo" | "blue" | "teal" | "orchid" | "rose" | "amber";

export interface AccentDefinition {
  name: AccentName;
  label: string;
  /** Brand hue. Fills are derived from it so text on them always hits AA. */
  base: string;
  /** Which text color sits on the filled accent. */
  on: "light" | "dark";
}

export const DEFAULT_ACCENT: AccentName = "violet";

export const accents: Record<AccentName, AccentDefinition> = {
  violet: { name: "violet", label: "Violet", base: "#7C5CFF", on: "light" },
  indigo: { name: "indigo", label: "Indigo", base: "#5B6CFF", on: "light" },
  blue: { name: "blue", label: "Blue", base: "#2F7BF5", on: "light" },
  teal: { name: "teal", label: "Teal", base: "#14B8A6", on: "dark" },
  orchid: { name: "orchid", label: "Orchid", base: "#B44CE0", on: "light" },
  rose: { name: "rose", label: "Rose", base: "#E5487A", on: "light" },
  amber: { name: "amber", label: "Amber", base: "#F2A93B", on: "dark" },
};

export interface AccentColors {
  /** Filled accent (primary buttons, outgoing bubbles, badges). */
  accent: string;
  accentHover: string;
  accentPressed: string;
  /** Text/icon color on `accent`. */
  accentContrast: string;
  /** Accent used as text or icon on regular surfaces (links, active tab). */
  accentText: string;
  /** Low-emphasis tinted background (selected row, chip). */
  accentSoft: string;
  accentSoftText: string;
  focusRing: string;
  bubbleOut: string;
  bubbleOutText: string;
  bubbleOutMeta: string;
}

const ON_LIGHT = "#FFFFFF";
const ON_DARK = "#0B0B12";

/**
 * Derive every accent-dependent token for a theme from a single base hex.
 * Used at build time for the shipped accents and at runtime for "My colors".
 */
export function deriveAccent(base: string, theme: ThemeName, on?: "light" | "dark"): AccentColors {
  const n = neutrals[theme];
  const onColor = on === "dark" ? ON_DARK : on === "light" ? ON_LIGHT : pickOn(base);
  const accent = ensureFillContrast(base, onColor, 4.5);
  const towards = onColor === ON_LIGHT ? "#000000" : "#FFFFFF";
  const accentHover = ensureFillContrast(mix(accent, towards, 0.1), onColor, 4.5);
  const accentPressed = ensureFillContrast(mix(accent, towards, 0.18), onColor, 4.5);
  const isLight = theme === "light";
  // Accent as text: lighten on dark themes, darken on light, until AA on every surface.
  const textSeed = isLight ? mix(base, "#000000", 0.15) : mix(base, "#FFFFFF", 0.3);
  const accentText = [n.bg, n.surface, n.surfaceRaised, n.surfaceHover].reduce(
    (c, bg) => ensureContrast(c, bg, 4.5),
    textSeed,
  );
  const accentSoft = alphaOver(base, isLight ? 0.12 : 0.18, n.surface);
  const accentSoftText = ensureContrast(accentText, accentSoft, 4.5);
  const bubbleOutMeta = ensureContrast(mix(onColor, accent, 0.22), accent, 4.5);
  return {
    accent,
    accentHover,
    accentPressed,
    accentContrast: onColor,
    accentText,
    accentSoft,
    accentSoftText,
    focusRing: accentText,
    bubbleOut: accent,
    bubbleOutText: onColor,
    bubbleOutMeta,
  };
}

function pickOn(base: string): string {
  // Prefer white text unless the fill would need to move a lot to support it.
  const darkened = ensureFillContrast(base, ON_LIGHT, 4.5);
  return darkened === "#000000" ? ON_DARK : ON_LIGHT;
}

export type ThemeColors = NeutralColors & AccentColors;

export function themeColors(theme: ThemeName, accent: AccentName = DEFAULT_ACCENT): ThemeColors {
  const def = accents[accent];
  return { ...neutrals[theme], ...deriveAccent(def.base, theme, def.on) };
}

/* -------------------------------------------------------------- gradients */

/**
 * Gradients are reserved: `brand` for the logo mark, `action` for the single
 * primary action on a screen (e.g. compose "+"), `aurora` for onboarding hero
 * art. Never use them on surfaces, borders, or text.
 */
export const gradients = {
  brand: "linear-gradient(135deg, #C9A6FF 0%, #8B5CF6 48%, #5B3BE0 100%)",
  action: "linear-gradient(135deg, #7C5CFF 0%, #5B3BE0 100%)",
  aurora: "linear-gradient(160deg, #2A1F5C 0%, #4B2E9E 55%, #8B5CF6 100%)",
} as const;
export type GradientName = keyof typeof gradients;

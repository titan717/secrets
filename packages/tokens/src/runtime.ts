import { contrastRatio } from "./color";
import { colorVarName } from "./css";
import { deriveAccent, type AccentColors, type ThemeName, type ThemePreference } from "./themes";

/** Resolve `system` to a concrete theme (dark when no DOM / no preference). */
export function resolveTheme(pref: ThemePreference, prefersLight?: boolean): ThemeName {
  if (pref !== "system") return pref;
  const light =
    prefersLight ??
    (typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
      : false);
  return light ? "light" : "dark";
}

export interface CustomAccentResult {
  colors: AccentColors;
  /** Contrast of bubble text on the outgoing bubble (always ≥ 4.5 after derivation). */
  bubbleContrast: number;
  /** True when the requested hex had to be adjusted to reach AA. */
  adjusted: boolean;
}

/** Derive and check a user-chosen accent ("My colors") for a theme. */
export function customAccent(hex: string, theme: ThemeName): CustomAccentResult {
  const colors = deriveAccent(hex, theme);
  return {
    colors,
    bubbleContrast: contrastRatio(colors.bubbleOut, colors.bubbleOutText),
    adjusted: colors.accent.toUpperCase() !== hex.toUpperCase(),
  };
}

/** Apply a custom accent as inline CSS variables (overrides data-accent). */
export function applyCustomAccent(el: HTMLElement, hex: string, theme: ThemeName): CustomAccentResult {
  const res = customAccent(hex, theme);
  for (const [k, v] of Object.entries(res.colors)) el.style.setProperty(colorVarName(k), v);
  return res;
}

export function clearCustomAccent(el: HTMLElement): void {
  const keys: (keyof AccentColors)[] = [
    "accent", "accentHover", "accentPressed", "accentContrast", "accentText", "accentSoft",
    "accentSoftText", "focusRing", "bubbleOut", "bubbleOutText", "bubbleOutMeta",
  ];
  for (const k of keys) el.style.removeProperty(colorVarName(k));
}

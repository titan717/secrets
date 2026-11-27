/** Spacing scale on a 4px base. Keys are multiples of 4px. */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;
export type SpaceKey = keyof typeof space;

export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  /** Message bubbles. Grouped bubbles tighten the joined corner to `xs`. */
  bubble: 18,
  full: 9999,
} as const;
export type RadiusKey = keyof typeof radius;

/** Inter (SIL OFL 1.1) with platform fallbacks. */
export const fontFamily = {
  sans: '"Inter", "InterVariable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  /** Native font for RN when Inter is not loaded. */
  native: "System",
} as const;

export const fontWeight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

/** size / line-height in px, letter-spacing in em. */
export const fontSize = {
  "2xs": { size: 11, line: 14, tracking: 0.01 },
  xs: { size: 12, line: 16, tracking: 0.005 },
  sm: { size: 13, line: 18, tracking: 0 },
  base: { size: 15, line: 22, tracking: -0.005 },
  md: { size: 17, line: 24, tracking: -0.01 },
  lg: { size: 20, line: 28, tracking: -0.012 },
  xl: { size: 24, line: 32, tracking: -0.015 },
  "2xl": { size: 30, line: 38, tracking: -0.02 },
  display: { size: 38, line: 46, tracking: -0.022 },
} as const;
export type FontSizeKey = keyof typeof fontSize;

/** Semantic text styles composed from the scale. */
export const textStyle = {
  display: { size: "display", weight: "bold" },
  title: { size: "xl", weight: "semibold" },
  heading: { size: "lg", weight: "semibold" },
  subheading: { size: "md", weight: "semibold" },
  body: { size: "base", weight: "regular" },
  bodyStrong: { size: "base", weight: "semibold" },
  label: { size: "sm", weight: "medium" },
  caption: { size: "xs", weight: "regular" },
  overline: { size: "2xs", weight: "semibold" },
} as const satisfies Record<string, { size: FontSizeKey; weight: keyof typeof fontWeight }>;

/** Motion durations in ms. All collapse to 0 under prefers-reduced-motion. */
export const duration = { instant: 0, fast: 120, base: 180, slow: 260, slower: 400 } as const;
export const easing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  enter: "cubic-bezier(0, 0, 0.2, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
  emphasized: "cubic-bezier(0.3, 0, 0, 1.2)",
} as const;

export const zIndex = {
  base: 0,
  sticky: 10,
  dropdown: 100,
  sheet: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
} as const;

/** Control heights (px). `touch` is the minimum hit target on touch devices. */
export const size = {
  controlSm: 32,
  controlMd: 40,
  controlLg: 48,
  touch: 44,
  avatarXs: 20,
  avatarSm: 28,
  avatarMd: 40,
  avatarLg: 56,
  avatarXl: 88,
  icon: 20,
  iconSm: 16,
  sidebar: 240,
  listPane: 340,
  infoPane: 320,
} as const;

export const breakpoints = { sm: 640, md: 900, lg: 1200, xl: 1440 } as const;

/** Elevation: dark themes rely on surface steps + hairline borders; shadows stay subtle. */
export const elevation = {
  dark: {
    0: "none",
    1: "0 1px 2px rgba(0, 0, 0, 0.40)",
    2: "0 4px 12px rgba(0, 0, 0, 0.45)",
    3: "0 12px 32px rgba(0, 0, 0, 0.55)",
  },
  black: {
    0: "none",
    1: "0 0 0 1px rgba(255, 255, 255, 0.04)",
    2: "0 0 0 1px rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.6)",
    3: "0 0 0 1px rgba(255, 255, 255, 0.08), 0 12px 32px rgba(0, 0, 0, 0.7)",
  },
  light: {
    0: "none",
    1: "0 1px 2px rgba(20, 21, 31, 0.06), 0 1px 1px rgba(20, 21, 31, 0.04)",
    2: "0 4px 12px rgba(20, 21, 31, 0.08), 0 1px 2px rgba(20, 21, 31, 0.06)",
    3: "0 16px 40px rgba(20, 21, 31, 0.14), 0 2px 6px rgba(20, 21, 31, 0.06)",
  },
} as const;
export type ElevationLevel = 0 | 1 | 2 | 3;

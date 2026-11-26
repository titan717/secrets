/**
 * Small, dependency-free color helpers used by tokens, tests and the runtime
 * accent override. All math follows WCAG 2.2 relative luminance / contrast.
 */

export type RGB = readonly [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as RGB;
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as unknown as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear mix in sRGB space. weight = share of `b` (0..1). */
export function mix(a: string, b: string, weight: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => A[i]! + (B[i]! - A[i]!) * weight) as unknown as RGB);
}

/** Composite a translucent color over an opaque background → opaque hex. */
export function alphaOver(fg: string, alpha: number, bg: string): string {
  return mix(bg, fg, alpha);
}

/**
 * Nudge `color` toward black or white (whichever increases contrast against
 * `against`) in small steps until the ratio reaches `target`.
 */
export function ensureContrast(color: string, against: string, target = 4.5): string {
  if (contrastRatio(color, against) >= target) return color.toUpperCase();
  const towards = relativeLuminance(against) > 0.18 ? "#000000" : "#FFFFFF";
  for (let w = 0.02; w <= 1.0001; w += 0.02) {
    const c = mix(color, towards, w);
    if (contrastRatio(c, against) >= target) return c;
  }
  return towards;
}

/** Darken/lighten a fill until `text` on it reaches `target`. */
export function ensureFillContrast(fill: string, text: string, target = 4.5): string {
  if (contrastRatio(fill, text) >= target) return fill.toUpperCase();
  const towards = relativeLuminance(text) > 0.18 ? "#000000" : "#FFFFFF";
  for (let w = 0.02; w <= 1.0001; w += 0.02) {
    const c = mix(fill, towards, w);
    if (contrastRatio(c, text) >= target) return c;
  }
  return towards;
}

export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_NON_TEXT = 3;

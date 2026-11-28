import { DEFAULT_ACCENT, findAccent } from "../../lib/theme";

export const profileUrl = (username: string) => `${location.origin}/u/${username}`;

/** Gradient banner color for a profile (uses their accent, falls back to Midnight blue). */
export function bannerStyle(accent: string | null | undefined): React.CSSProperties {
  const a = findAccent(accent ?? DEFAULT_ACCENT);
  return {
    background: `radial-gradient(120% 140% at 0% 0%, ${a.c1}cc, transparent 60%), radial-gradient(120% 140% at 100% 100%, ${a.c2}cc, transparent 55%), linear-gradient(135deg, ${a.c1}55, ${a.c2}88)`,
  };
}

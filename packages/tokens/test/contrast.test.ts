import { describe, expect, it } from "vitest";
import {
  accents,
  AA_NON_TEXT,
  AA_TEXT,
  contrastRatio,
  customAccent,
  deriveAccent,
  neutrals,
  THEMES,
  themeColors,
  type AccentName,
} from "../src";

const ACCENTS = Object.keys(accents) as AccentName[];

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });
});

describe.each(THEMES)("theme %s", (theme) => {
  const n = neutrals[theme];
  const surfaces = {
    bg: n.bg,
    surface: n.surface,
    surfaceRaised: n.surfaceRaised,
    surfaceHover: n.surfaceHover,
    surfaceActive: n.surfaceActive,
  };
  const texts = {
    text: n.text,
    textMuted: n.textMuted,
    textSubtle: n.textSubtle,
    successText: n.successText,
    dangerText: n.dangerText,
    warningText: n.warningText,
  };

  for (const [tName, t] of Object.entries(texts)) {
    for (const [sName, s] of Object.entries(surfaces)) {
      it(`${tName} on ${sName} ≥ 4.5`, () => {
        expect(contrastRatio(t, s)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it("text on soft status backgrounds ≥ 4.5", () => {
    expect(contrastRatio(n.dangerText, n.dangerSoft)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(n.successText, n.successSoft)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(n.warningText, n.warningSoft)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("incoming bubble text and meta ≥ 4.5", () => {
    expect(contrastRatio(n.bubbleInText, n.bubbleIn)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(n.bubbleInMeta, n.bubbleIn)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("danger button label ≥ 4.5", () => {
    expect(contrastRatio(n.dangerContrast, n.danger)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("input borders and presence dot ≥ 3:1 (non-text)", () => {
    for (const s of [n.bg, n.surface, n.surfaceRaised]) {
      expect(contrastRatio(n.borderStrong, s)).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(contrastRatio(n.success, s)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  describe.each(ACCENTS)("accent %s", (accent) => {
    const c = themeColors(theme, accent);
    it("outgoing bubble text and meta ≥ 4.5", () => {
      expect(contrastRatio(c.bubbleOutText, c.bubbleOut)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(c.bubbleOutMeta, c.bubbleOut)).toBeGreaterThanOrEqual(AA_TEXT);
    });
    it("label on filled accent (incl. hover/pressed) ≥ 4.5", () => {
      for (const f of [c.accent, c.accentHover, c.accentPressed]) {
        expect(contrastRatio(c.accentContrast, f)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
    it("accent text on surfaces and soft accent ≥ 4.5", () => {
      for (const s of Object.values(surfaces)) {
        if (s === n.surfaceActive) continue;
        expect(contrastRatio(c.accentText, s)).toBeGreaterThanOrEqual(AA_TEXT);
      }
      expect(contrastRatio(c.accentSoftText, c.accentSoft)).toBeGreaterThanOrEqual(AA_TEXT);
    });
    it("focus ring ≥ 3:1 against bg and surface", () => {
      expect(contrastRatio(c.focusRing, n.bg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(contrastRatio(c.focusRing, n.surface)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });
  });
});

describe("custom accents", () => {
  it.each(["#FFFF00", "#00FF88", "#101010", "#FF0000", "#8B5CF6", "#7C5CFF"])(
    "%s is adjusted to meet AA in every theme",
    (hex) => {
      for (const theme of THEMES) {
        const r = customAccent(hex, theme);
        expect(r.bubbleContrast).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(r.colors.accentText, neutrals[theme].surface)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it("default violet stays close to the brand hue", () => {
    const a = deriveAccent(accents.violet.base, "dark", "light").accent;
    expect(a).toMatch(/^#7[0-9A-F]5[0-9A-F]F[0-9A-F]$/);
  });
});

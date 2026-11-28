import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, accentInk, GRADIENT_ACCENTS, SOLID_ACCENTS, accentCss, contrast, customAccent, findAccent, mixHex, onColor } from "./theme";

describe("accents (blueprint p7)", () => {
  it("has 19 solids and 6 gradients, default is Midnight blue", () => {
    expect(SOLID_ACCENTS).toHaveLength(19);
    expect(GRADIENT_ACCENTS).toHaveLength(6);
    expect(DEFAULT_ACCENT).toBe("g-midnight");
    expect(findAccent(DEFAULT_ACCENT).name).toBe("Midnight");
    expect(findAccent("g-secrets").id).toBe("g-secrets");
  });
  it("keeps accent text/icons at AA on every theme background", () => {
    for (const a of [...SOLID_ACCENTS.slice(1), ...GRADIENT_ACCENTS]) {
      expect(contrast(accentInk(a, "#000000", false), "#000000")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accentInk(a, "#0e0e13", false), "#0e0e13")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accentInk(a, "#f2f2f7", true), "#f2f2f7")).toBeGreaterThanOrEqual(4.5);
    }
    const m = findAccent("g-midnight");
    expect(contrast(onColor("#203086"), "#203086")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(m.c1, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("falls back to the default for unknown ids and parses custom colours", () => {
    expect(findAccent("nope").id).toBe(DEFAULT_ACCENT);
    const c = findAccent("custom:#ff0000");
    expect(c.c1).toBe("#ff0000");
    expect(customAccent("#ABCDEF").id).toBe("custom:#abcdef");
  });
  it("renders gradients as CSS gradients", () => {
    expect(accentCss(findAccent("g-secrets"))).toContain("gradient");
  });
  it("picks a readable text colour (AA)", () => {
    for (const a of SOLID_ACCENTS) expect(contrast(a.c1, onColor(a.c1))).toBeGreaterThanOrEqual(3);
    expect(onColor("#ffffff")).toBe("#000000");
    expect(onColor("#000000")).toBe("#ffffff");
  });
  it("mixes hex colours", () => {
    expect(mixHex("#000000", "#ffffff", 0.5).toLowerCase()).toMatch(/^#(7f|80){3}$/);
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, GRADIENT_ACCENTS, SOLID_ACCENTS, accentCss, contrast, customAccent, findAccent, mixHex, onColor } from "./theme";

describe("accents (blueprint p7)", () => {
  it("has 19 solids and 5 gradients, default is the Secrets gradient", () => {
    expect(SOLID_ACCENTS).toHaveLength(19);
    expect(GRADIENT_ACCENTS).toHaveLength(5);
    expect(DEFAULT_ACCENT).toBe("g-secrets");
    expect(findAccent(DEFAULT_ACCENT).id).toBe("g-secrets");
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

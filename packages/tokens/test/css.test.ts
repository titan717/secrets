import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateCss, vars } from "../src";

describe("tokens.css", () => {
  const css = generateCss();
  it("is committed and up to date", () => {
    expect(readFileSync(resolve(__dirname, "../tokens.css"), "utf8")).toBe(css);
  });
  it.each(['[data-theme="dark"]', '[data-theme="black"]', '[data-theme="light"]', '[data-theme="system"]'])(
    "defines %s",
    (sel) => expect(css).toContain(sel),
  );
  it("black theme uses true black", () => {
    const black = css.split('[data-theme="black"] {')[1]!.split("}")[0]!;
    expect(black).toContain("--color-bg: #000000;");
  });
  it("collapses motion under reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*--duration-base: 0ms/);
  });
  it("exposes var() references", () => {
    expect(vars.color.bubbleOut).toBe("var(--color-bubble-out)");
    expect(vars.space[4]).toBe("var(--space-4)");
  });
});

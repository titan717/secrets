import axe from "axe-core";
import { expect } from "vitest";

/** Run axe-core on a container. Color contrast is verified in @secrets/tokens tests (jsdom can't compute it). */
export async function expectNoAxeViolations(container: Element) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
  expect(summary).toEqual([]);
}

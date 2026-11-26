import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCss } from "../src/css";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../tokens.css");
const css = generateCss();
if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== css) {
    console.error("tokens.css is out of date. Run `pnpm --filter @secrets/tokens gen:css`.");
    process.exit(1);
  }
  console.log("tokens.css is up to date.");
} else {
  writeFileSync(out, css);
  console.log(`wrote ${out} (${css.length} bytes)`);
}

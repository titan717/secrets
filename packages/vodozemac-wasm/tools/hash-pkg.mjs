// Prints "sha256  path" for every file in pkg-web/ and pkg-node/ (sorted), then a combined digest.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const files = [];
const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
for (const d of ["pkg-web", "pkg-node"]) walk(d);
const lines = files.filter((f) => !f.endsWith(".gitignore")).sort()
  .map((f) => `${createHash("sha256").update(readFileSync(f)).digest("hex")}  ${f}`);
const all = createHash("sha256").update(lines.join("\n") + "\n").digest("hex");
process.stdout.write(lines.join("\n") + `\n${all}  TOTAL\n`);

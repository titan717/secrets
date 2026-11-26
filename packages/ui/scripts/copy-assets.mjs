import { cpSync } from "node:fs";
cpSync("src/styles.css", "dist/styles.css");
cpSync("src/assets", "dist/assets", { recursive: true });

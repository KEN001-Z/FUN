import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const OUTPUT = resolve(ROOT, "dist");
const PUBLIC_FILES = ["index.html", "cbt.html", "style.css", "favicon.svg", "study-api.js", "app.js", "cbt.js", "assistant.js"];

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
for (const file of PUBLIC_FILES) {
  await copyFile(resolve(ROOT, file), resolve(OUTPUT, file));
}

console.log(`Prepared ${PUBLIC_FILES.length} public files in dist.`);

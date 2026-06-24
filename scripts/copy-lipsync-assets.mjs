// Copies the self-hosted lip-sync-engine (Rhubarb WASM) runtime files from
// node_modules into public/lipsync so the browser can fetch them same-origin.
//
// We self-host (rather than the package's default unpkg CDN) because the
// deploy/runtime network blocks some CDNs — the same reason avatar GLBs are
// bundled. The 36 MB PocketSphinx data file is intentionally NOT committed
// (see .gitignore); this script regenerates it on every `npm install`
// (via the postinstall hook) so the repo stays light and Railway builds work.

import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "lip-sync-engine", "dist");
const dest = join(root, "public", "lipsync");

const files = [
  ["wasm/lip-sync-engine.wasm", "lip-sync-engine.wasm"],
  ["wasm/lip-sync-engine.data", "lip-sync-engine.data"],
  ["wasm/lip-sync-engine.js", "lip-sync-engine.js"],
  ["worker.js", "worker.js"],
];

async function main() {
  if (!existsSync(src)) {
    // The optional dep isn't installed (e.g. lip-sync left on the default
    // `rule` engine). Skip silently so install never fails.
    console.log("[lipsync] lip-sync-engine not installed; skipping asset copy.");
    return;
  }
  await mkdir(dest, { recursive: true });
  for (const [from, to] of files) {
    await copyFile(join(src, from), join(dest, to));
  }
  console.log(`[lipsync] Copied ${files.length} Rhubarb WASM assets to public/lipsync.`);
}

main().catch((err) => {
  // Don't hard-fail install; the rule engine still works without these assets.
  console.warn("[lipsync] Failed to copy WASM assets:", err?.message ?? err);
});

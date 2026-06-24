import { Audio2FaceEngine } from "./audio2face-engine";
import { RhubarbLipSyncEngine } from "./rhubarb-engine";
import { RuleLipSyncEngine } from "./rule-engine";
import type { LipSyncEngine, LipSyncEngineId } from "./types";

/**
 * Selects the active lip-sync engine from `NEXT_PUBLIC_LIPSYNC_ENGINE`
 * (default `rule`, matching the existing provider-flag pattern). The instance is
 * cached so WASM-backed engines initialize once per page.
 *
 * Engines are constructed synchronously and do any heavy work lazily inside
 * `generate()` (or `warmup()`), so this is safe to call during render.
 */
let cached: LipSyncEngine | null = null;

export function getLipSyncEngineId(): LipSyncEngineId {
  const raw = process.env.NEXT_PUBLIC_LIPSYNC_ENGINE;
  if (raw === "rhubarb" || raw === "audio2face") return raw;
  return "rule";
}

export function getLipSyncEngine(): LipSyncEngine {
  if (cached) return cached;
  cached = createEngine(getLipSyncEngineId());
  return cached;
}

function createEngine(id: LipSyncEngineId): LipSyncEngine {
  switch (id) {
    case "rhubarb":
      return new RhubarbLipSyncEngine();
    // `audio2face` is a scaffolded seam: its /api/lipsync route returns 501 until
    // a GPU backend is wired, so VisemePlayer transparently falls back to `rule`.
    case "audio2face":
      return new Audio2FaceEngine();
    case "rule":
    default:
      return new RuleLipSyncEngine();
  }
}

/** The always-available fallback engine (used when a selected engine throws). */
export function getFallbackEngine(): LipSyncEngine {
  return new RuleLipSyncEngine();
}

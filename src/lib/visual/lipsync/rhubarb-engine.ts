"use client";

import type { WorkerPool } from "lip-sync-engine";
import { stripDeliveryTagsForDisplay } from "@/lib/voice/delivery-tags";
import { audioBufferToPcm16Mono } from "./audio";
import {
  type LipSyncEngine,
  type LipSyncInput,
  type VisemeName,
  type VisemeSegment,
  type VisemeTimeline,
} from "./types";

/** Where the self-hosted WASM/worker assets live (see scripts/copy-lipsync-assets.mjs). */
const ASSET_BASE = "/lipsync";
const SAMPLE_RATE = 16000;

/**
 * Rhubarb's Preston-Blair mouth shapes (A–H, X) mapped to the avatar's Oculus
 * visemes. The mapping follows the library's documented phoneme groupings:
 *   X closed/rest        -> (omitted; mouth rests closed)
 *   A open (AH/AA/AO/AW) -> viseme_aa
 *   B lips together(PBM) -> viseme_PP
 *   C rounded (SH/CH/JH) -> viseme_CH
 *   D tongue-teeth(TDNL) -> viseme_DD
 *   E slightly open(EH)  -> viseme_E
 *   F lip-teeth (F/V)    -> viseme_FF
 *   G open back (K/G/NG) -> viseme_kk
 *   H wide open (EE/IH)  -> viseme_I
 */
const SHAPE_TO_VISEME: Record<string, VisemeName | null> = {
  X: null,
  A: "viseme_aa",
  B: "viseme_PP",
  C: "viseme_CH",
  D: "viseme_DD",
  E: "viseme_E",
  F: "viseme_FF",
  G: "viseme_kk",
  H: "viseme_I",
};

/**
 * Accurate, audio-driven lip-sync using the Rhubarb WASM port
 * (`lip-sync-engine`). Audio analysis runs in a Web Worker pool so the main
 * thread stays responsive; the dialog text is passed as a recognition hint.
 * Output is normalized to the shared {@link VisemeTimeline}.
 */
export class RhubarbLipSyncEngine implements LipSyncEngine {
  readonly id = "rhubarb" as const;
  private poolPromise: Promise<WorkerPool> | null = null;

  /** Begin loading the WASM/worker pool ahead of the first utterance. */
  warmup() {
    void this.ensurePool();
  }

  private ensurePool(): Promise<WorkerPool> {
    if (this.poolPromise) return this.poolPromise;
    this.poolPromise = (async () => {
      // Dynamic import keeps the ~80 KB module (and any browser-only code) out
      // of the bundle unless the rhubarb engine is actually selected/used.
      const { WorkerPool } = await import("lip-sync-engine");
      const pool = WorkerPool.getInstance(2, `${ASSET_BASE}/worker.js`);
      await pool.init({
        wasmPath: `${ASSET_BASE}/lip-sync-engine.wasm`,
        dataPath: `${ASSET_BASE}/lip-sync-engine.data`,
        jsPath: `${ASSET_BASE}/lip-sync-engine.js`,
        workerScriptUrl: `${ASSET_BASE}/worker.js`,
      });
      await pool.warmup();
      return pool;
    })();
    // If init fails, clear the cache so a later attempt can retry.
    this.poolPromise.catch(() => {
      this.poolPromise = null;
    });
    return this.poolPromise;
  }

  async generate(input: LipSyncInput): Promise<VisemeTimeline> {
    const pool = await this.ensurePool();
    const pcm16 = await audioBufferToPcm16Mono(input.audioBuffer, SAMPLE_RATE);
    const dialogText = stripDeliveryTagsForDisplay(input.text).trim();

    const result = await pool.analyze(pcm16, {
      dialogText: dialogText || undefined,
      sampleRate: SAMPLE_RATE,
    });

    const segments: VisemeSegment[] = [];
    for (const cue of result.mouthCues) {
      const viseme = SHAPE_TO_VISEME[cue.value];
      if (!viseme) continue; // X / unknown -> let the mouth rest closed
      segments.push({
        viseme,
        start: cue.start * 1000,
        end: cue.end * 1000,
      });
    }

    return { durationMs: input.durationMs, segments };
  }
}

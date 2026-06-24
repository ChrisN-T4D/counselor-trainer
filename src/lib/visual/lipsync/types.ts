import type { WordTimings } from "@/lib/visual/word-timings";

/**
 * Oculus viseme blend-shape names present on RPM / AvatarSDK avatars.
 * Lip-sync engines emit segments referencing these names; the avatar's
 * `VisemePlayer` resolves each name to whichever morph targets exist on its meshes.
 */
export const VISEME_NAMES = [
  "viseme_sil",
  "viseme_PP",
  "viseme_FF",
  "viseme_TH",
  "viseme_DD",
  "viseme_kk",
  "viseme_CH",
  "viseme_SS",
  "viseme_nn",
  "viseme_RR",
  "viseme_aa",
  "viseme_E",
  "viseme_I",
  "viseme_O",
  "viseme_U",
] as const;

export type VisemeName = (typeof VISEME_NAMES)[number];

/** One mouth shape held over an absolute time window (milliseconds from clip start). */
export type VisemeSegment = {
  /** Full Oculus viseme morph name, e.g. `viseme_aa`. */
  viseme: VisemeName;
  /** Start time in milliseconds from the beginning of the audio clip. */
  start: number;
  /** End time in milliseconds from the beginning of the audio clip. */
  end: number;
};

/** A normalized, source-agnostic lip-sync result the avatar can render directly. */
export type VisemeTimeline = {
  /** Total clip duration in milliseconds. */
  durationMs: number;
  /** Time-ordered (overlap allowed) viseme segments. */
  segments: VisemeSegment[];
};

/** Everything an engine may need to derive a {@link VisemeTimeline}. */
export type LipSyncInput = {
  /** Decoded audio (preferred signal source for audio-driven engines). */
  audioBuffer: AudioBuffer;
  /** Spoken text — used as a dialog hint and as a fallback for rule-based timing. */
  text: string;
  /** Clip duration in milliseconds (derived from `audioBuffer`). */
  durationMs: number;
  /** Per-word timings from ElevenLabs alignment, when available. */
  wordTimings?: WordTimings;
};

/**
 * A swappable lip-sync provider. Implementations turn audio (and/or text) into a
 * normalized {@link VisemeTimeline}. The default is the rule-based engine; a
 * Rhubarb (WASM) engine and a future NVIDIA Audio2Face-3D engine implement the
 * same contract so they drop in via `NEXT_PUBLIC_LIPSYNC_ENGINE`.
 */
export interface LipSyncEngine {
  /** Stable identifier (matches the `NEXT_PUBLIC_LIPSYNC_ENGINE` value). */
  readonly id: LipSyncEngineId;
  /** Produce a viseme timeline for one utterance. */
  generate(input: LipSyncInput): Promise<VisemeTimeline>;
  /**
   * Optional: kick off any expensive initialization (e.g. loading WASM) ahead of
   * the first `generate()` so the first reply isn't delayed. Safe to call repeatedly.
   */
  warmup?(): void;
}

export type LipSyncEngineId = "rule" | "rhubarb" | "audio2face";

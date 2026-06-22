import type { WordTimings } from "@/lib/visual/word-timings";

export type TtsResult = {
  audio: ArrayBuffer;
  /** Present when the provider can return precise per-word lip-sync timing. */
  wordTimings?: WordTimings;
};

export interface TtsProvider {
  synthesize(
    text: string,
    opts?: { voiceId?: string; stream?: boolean },
  ): Promise<ArrayBuffer>;
  /** Synthesize and (when supported) return character-aligned word timings for lip-sync. */
  synthesizeWithTimings?(
    text: string,
    opts?: { voiceId?: string },
  ): Promise<TtsResult>;
  synthesizeStream?(
    text: string,
    opts?: { voiceId?: string },
  ): ReadableStream<Uint8Array>;
}

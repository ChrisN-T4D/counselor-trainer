import { LipsyncEn } from "@met4citizen/talkinghead/modules/lipsync-en.mjs";
import { estimateWordTimings } from "@/lib/visual/word-timings";
import {
  VISEME_NAMES,
  type LipSyncEngine,
  type LipSyncInput,
  type VisemeName,
  type VisemeSegment,
  type VisemeTimeline,
} from "./types";

type LipsyncResult = { visemes: string[]; times: number[]; durations: number[] };

const VISEME_SET = new Set<string>(VISEME_NAMES);

/**
 * The original approximate lip-sync: TalkingHead's English word->viseme rules
 * (`LipsyncEn.wordsToVisemes`) timed against ElevenLabs word alignment (or an
 * estimate). Extracted from `VisemePlayer` unchanged so it stays the safe default
 * and the guaranteed fallback when another engine fails.
 */
export class RuleLipSyncEngine implements LipSyncEngine {
  readonly id = "rule" as const;
  private readonly lipsync = new LipsyncEn();

  async generate(input: LipSyncInput): Promise<VisemeTimeline> {
    const { text, durationMs, wordTimings } = input;
    const timings =
      wordTimings && wordTimings.words.length > 0
        ? wordTimings
        : estimateWordTimings(text, durationMs);

    const segments: VisemeSegment[] = [];
    for (let i = 0; i < timings.words.length; i += 1) {
      const word = timings.words[i].replace(/[^a-zA-Z']/g, "");
      if (!word) continue;

      const wordStart = timings.wtimes[i];
      const wordDur = timings.wdurations[i];
      const v = this.lipsync.wordsToVisemes(word) as LipsyncResult;
      if (!v.visemes.length) continue;

      const relTotal = v.times[v.times.length - 1] + v.durations[v.durations.length - 1];
      const scale = relTotal > 0 ? wordDur / relTotal : 0;

      for (let k = 0; k < v.visemes.length; k += 1) {
        const viseme = `viseme_${v.visemes[k]}`;
        if (!VISEME_SET.has(viseme)) continue;
        const start = wordStart + v.times[k] * scale;
        const end = start + Math.max(v.durations[k] * scale, 30);
        segments.push({ viseme: viseme as VisemeName, start, end });
      }
    }

    return { durationMs, segments };
  }
}

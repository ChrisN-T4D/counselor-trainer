import { stripDeliveryTagsForDisplay } from "@/lib/voice/delivery-tags";

/** Per-word lip-sync timing (milliseconds) consumed by TalkingHead's speakAudio. */
export type WordTimings = {
  words: string[];
  wtimes: number[];
  wdurations: number[];
};

/**
 * Build accurate word timings from ElevenLabs character-level alignment.
 * `startTimes`/`endTimes` are in seconds (per character); output is in milliseconds.
 */
export function wordTimingsFromAlignment(
  characters: string[],
  startTimes: number[],
  endTimes: number[],
): WordTimings {
  const words: string[] = [];
  const wtimes: number[] = [];
  const wdurations: number[] = [];

  let current = "";
  let wordStart = 0;
  let wordEnd = 0;
  let hasChar = false;

  const flush = () => {
    if (current.length > 0) {
      words.push(current);
      wtimes.push(Math.round(wordStart * 1000));
      wdurations.push(Math.max(40, Math.round((wordEnd - wordStart) * 1000)));
    }
    current = "";
    hasChar = false;
  };

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (!hasChar) {
      wordStart = startTimes[i] ?? wordEnd;
      hasChar = true;
    }
    current += ch;
    wordEnd = endTimes[i] ?? startTimes[i] ?? wordStart;
  }
  flush();

  return { words, wtimes, wdurations };
}

/** Rough word timings for TalkingHead lip-sync when using external TTS audio. */
export function estimateWordTimings(text: string, durationMs: number): WordTimings {
  const spoken = stripDeliveryTagsForDisplay(text);
  const words = spoken.split(/\s+/).filter(Boolean);

  if (words.length === 0 || durationMs <= 0) {
    return {
      words: [spoken || "..."],
      wtimes: [0],
      wdurations: [Math.max(durationMs, 500)],
    };
  }

  const totalChars = words.reduce((sum, word) => sum + word.length, 0);
  let cursor = 0;
  const wtimes: number[] = [];
  const wdurations: number[] = [];

  for (const word of words) {
    const duration = Math.max(80, (word.length / totalChars) * durationMs);
    wtimes.push(cursor);
    wdurations.push(duration);
    cursor += duration;
  }

  return { words, wtimes, wdurations };
}

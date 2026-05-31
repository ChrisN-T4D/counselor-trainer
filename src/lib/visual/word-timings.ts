import { stripDeliveryTagsForDisplay } from "@/lib/voice/delivery-tags";

/** Rough word timings for TalkingHead lip-sync when using external TTS audio. */
export function estimateWordTimings(text: string, durationMs: number) {
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

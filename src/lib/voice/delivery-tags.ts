/** Tags the client LLM may embed for voice delivery. Hidden in chat UI; passed to TTS. */
export const DELIVERY_TAGS = [
  "pause",
  "long pause",
  "hesitant",
  "whispers",
  "sigh",
  "tearful",
  "sad",
  "crying",
  "angry",
  "frustrated",
  "agitated",
  "upset",
  "nervous",
  "quietly",
] as const;

export const CLIENT_DELIVERY_PROMPT = `Voice delivery tags (optional — hidden during live practice, shown in post-session review transcript):
- Place tags in square brackets immediately before the words they affect.
- Allowed tags: ${DELIVERY_TAGS.map((tag) => `[${tag}]`).join(" ")}
- Use sparingly when emotion or pacing shifts — not on every line.
- Example: "[hesitant] I don't know... [pause] it's been really hard lately. [tearful] I just feel like I'm falling apart."
- Match tags to relationship state, safety state, and what the therapist just said.`;

const TAG_ALTERNATION = DELIVERY_TAGS.map((tag) => tag.replace(/\s+/g, "\\s+")).join("|");
const TAG_PATTERN = new RegExp(`\\[(?:${TAG_ALTERNATION})\\]`, "i");
const TAG_REPLACE_PATTERN = new RegExp(`\\[(?:${TAG_ALTERNATION})\\]`, "gi");

export function hasDeliveryTags(text: string): boolean {
  return TAG_PATTERN.test(text);
}

/** Remove delivery tags for on-screen chat text. */
export function stripDeliveryTagsForDisplay(text: string): string {
  return text
    .replace(TAG_REPLACE_PATTERN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Hide partial `[tag` while streaming so tags do not flash on screen. */
export function stripIncompleteDeliveryTags(text: string): string {
  return text.replace(/\[[^\]\n]*$/i, "");
}

export type TranscriptSegment =
  | { type: "text"; value: string }
  | { type: "tag"; value: string };

const TAG_SPLIT_PATTERN = new RegExp(`(\\[(?:${TAG_ALTERNATION})\\])`, "gi");

/** Split client text into speakable text and delivery-tag segments (for review transcript). */
export function parseClientTextWithDeliveryTags(text: string): TranscriptSegment[] {
  const parts = text.split(TAG_SPLIT_PATTERN).filter((part) => part.length > 0);
  const segments: TranscriptSegment[] = [];

  for (const part of parts) {
    const tagMatch = part.match(/^\[(.+)\]$/i);
    if (tagMatch) {
      segments.push({ type: "tag", value: tagMatch[1].toLowerCase() });
      continue;
    }
    segments.push({ type: "text", value: part });
  }

  return segments;
}

export function extractDeliveryTags(text: string): string[] {
  return parseClientTextWithDeliveryTags(text)
    .filter((segment): segment is Extract<TranscriptSegment, { type: "tag" }> => segment.type === "tag")
    .map((segment) => segment.value);
}

export function formatClientTextForDisplay(text: string, streaming = false): string {
  const withoutPartial = streaming ? stripIncompleteDeliveryTags(text) : text;
  return stripDeliveryTagsForDisplay(withoutPartial);
}

export type DeliveryVoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
};

/** Tune ElevenLabs voice settings from delivery tags in the text. */
export function voiceSettingsForDelivery(text: string): DeliveryVoiceSettings {
  const lower = text.toLowerCase();

  if (/\[(angry|frustrated|agitated)\]/.test(lower)) {
    return { stability: 0.3, similarity_boost: 0.8, style: 0.7 };
  }
  if (/\[(tearful|crying|sad)\]/.test(lower)) {
    return { stability: 0.35, similarity_boost: 0.85, style: 0.6 };
  }
  if (/\[(upset|nervous|hesitant)\]/.test(lower)) {
    return { stability: 0.45, similarity_boost: 0.8, style: 0.5 };
  }
  if (/\[(whispers|quietly)\]/.test(lower)) {
    return { stability: 0.55, similarity_boost: 0.75, style: 0.45 };
  }

  return { stability: 0.5, similarity_boost: 0.75, style: 0.35 };
}

/** Normalize tags for Eleven v3 audio-tag syntax (e.g. [long pause] -> [pause]). */
export function normalizeDeliveryTagsForTts(text: string): string {
  return text.replace(/\[long pause\]/gi, "[pause]");
}

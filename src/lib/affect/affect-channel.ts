import { z } from "zod";
import { EKMAN_AXES, type EmotionVector } from "./emotion";
import { REACTION_CUES, type ReactionCue } from "./emotion-state";

// The client LLM emits a compact, machine-only affect block as the final line of
// its reply (never spoken, stripped before display — like delivery tags). It
// reports the client's *felt* emotion vector so the avatar can render affect that
// stays consistent with the words.

export const AFFECT_MARKER = "[[affect]]";

export type ParsedAffect = {
  vector: Partial<EmotionVector>;
  arousal?: number;
  rapport?: number;
  cues: ReactionCue[];
};

const cueSet = new Set<string>(REACTION_CUES);

const affectJsonSchema = z
  .object({
    anger: z.number().optional(),
    disgust: z.number().optional(),
    fear: z.number().optional(),
    sadness: z.number().optional(),
    enjoyment: z.number().optional(),
    surprise: z.number().optional(),
    contempt: z.number().optional(),
    arousal: z.number().optional(),
    rapport: z.number().optional(),
    cues: z.array(z.string()).optional(),
  })
  .passthrough();

export const CLIENT_AFFECT_PROMPT = `Affect side-channel (machine-only — NEVER spoken, NEVER shown, NEVER mentioned):
- After your spoken reply, output exactly ONE final line that begins with ${AFFECT_MARKER} followed by a compact JSON object describing how the client FEELS right now.
- Keys (all optional, omit zeros): anger, disgust, fear, sadness, enjoyment, surprise, contempt — each 0..1 intensity (Ekman emotions). arousal 0..1 (overall activation/energy). rapport from -0.1..0.1 (change in trust toward the counselor this turn). cues: array of brief nonverbal reactions to what the counselor just said, from: ${REACTION_CUES.join(", ")}.
- Report genuine internal feeling even when the client is hiding it outwardly.
- Put NOTHING after this line. Example final line:
${AFFECT_MARKER} {"sadness":0.7,"fear":0.2,"arousal":0.4,"rapport":-0.02,"cues":["look_away"]}`;

/**
 * The portion of streamed text safe to show: everything before the affect marker,
 * also trimming a trailing partial marker so it never flashes mid-stream.
 */
export function safeVisibleText(raw: string): string {
  const idx = raw.indexOf(AFFECT_MARKER);
  if (idx >= 0) return raw.slice(0, idx);
  // Trim a trailing partial prefix of the marker (e.g. "...words [[aff").
  for (let len = Math.min(AFFECT_MARKER.length - 1, raw.length); len > 0; len -= 1) {
    if (raw.endsWith(AFFECT_MARKER.slice(0, len))) {
      return raw.slice(0, raw.length - len);
    }
  }
  return raw;
}

/** Remove the affect block from a complete reply (for storage/display). */
export function stripAffectBlock(text: string): string {
  const idx = text.indexOf(AFFECT_MARKER);
  return (idx >= 0 ? text.slice(0, idx) : text).trimEnd();
}

/** Extract + validate the affect block from a complete reply; null if absent/invalid. */
export function parseAffectBlock(text: string): ParsedAffect | null {
  const idx = text.indexOf(AFFECT_MARKER);
  if (idx < 0) return null;
  const after = text.slice(idx + AFFECT_MARKER.length);
  const open = after.indexOf("{");
  if (open < 0) return null;
  const close = after.lastIndexOf("}");
  if (close <= open) return null;

  let json: unknown;
  try {
    json = JSON.parse(after.slice(open, close + 1));
  } catch {
    return null;
  }

  const parsed = affectJsonSchema.safeParse(json);
  if (!parsed.success) return null;

  const data = parsed.data;
  const vector: Partial<EmotionVector> = {};
  for (const axis of EKMAN_AXES) {
    const v = data[axis];
    if (typeof v === "number" && v > 0) vector[axis] = Math.min(1, Math.max(0, v));
  }

  const cues: ReactionCue[] = Array.isArray(data.cues)
    ? data.cues.filter((c): c is ReactionCue => cueSet.has(c))
    : [];

  return {
    vector,
    arousal: typeof data.arousal === "number" ? Math.min(1, Math.max(0, data.arousal)) : undefined,
    rapport:
      typeof data.rapport === "number" ? Math.min(0.1, Math.max(-0.1, data.rapport)) : undefined,
    cues,
  };
}

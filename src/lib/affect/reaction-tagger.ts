import type { AppraisalDelta, ReactionCue } from "./emotion-state";

// A fast, cheap (lexicon-only) appraisal of what the trainee is saying, run on
// debounced streaming-STT partials to drive mid-utterance client reactions. It
// is intentionally coarse: the authoritative emotional read still comes from the
// LLM reply's affect side-channel. This just makes the client *visibly* respond
// while the trainee is still talking. (A tiny-LLM pass could replace this later.)

type LexiconRule = {
  pattern: RegExp;
  delta: AppraisalDelta;
  cues: ReactionCue[];
};

const RULES: LexiconRule[] = [
  // Empathy / validation — the client feels seen (can bring tears), trust rises.
  {
    pattern:
      /\b(i (understand|hear you|get it)|that (makes sense|sounds (hard|tough|painful))|must be (hard|difficult|painful)|i'?m sorry)\b/i,
    delta: { emotion: { sadness: 0.12 }, rapport: 0.04, arousal: -0.04 },
    cues: ["soften", "tear_onset"],
  },
  // Reassurance / safety — settles arousal, builds alliance.
  {
    pattern: /\b(you'?re safe|i'?m here|take your time|no rush|whenever you'?re ready|it'?s okay)\b/i,
    delta: { emotion: { fear: -0.1 }, rapport: 0.05, arousal: -0.06 },
    cues: ["soften"],
  },
  // Praise / progress — positive affect.
  {
    pattern: /\b(proud of you|well done|great (job|work)|that'?s (great|wonderful)|you'?ve made progress)\b/i,
    delta: { emotion: { enjoyment: 0.2 }, rapport: 0.04 },
    cues: ["soften", "brow_flash"],
  },
  // Confrontation / pressure — defensive anger + fear, alliance dips.
  {
    pattern: /\b(you (need to|have to|should|must)|why (didn'?t|don'?t) you|that'?s not (true|right)|calm down)\b/i,
    delta: { emotion: { anger: 0.15, fear: 0.08 }, rapport: -0.05, arousal: 0.08 },
    cues: ["wince", "recoil"],
  },
  // Blame / judgment — shame (sadness + disgust), gaze aversion.
  {
    pattern: /\b(your fault|to blame|you'?re wrong|that'?s (bad|wrong)|disappointed)\b/i,
    delta: { emotion: { sadness: 0.12, disgust: 0.1 }, rapport: -0.04 },
    cues: ["look_away", "wince"],
  },
  // Alarming / risk content — fear spikes, freeze.
  {
    pattern: /\b(hurt yourself|harm yourself|kill yourself|suicid|want to die|end it all|overdose)\b/i,
    delta: { emotion: { fear: 0.2, sadness: 0.15 }, arousal: 0.1 },
    cues: ["freeze", "tear_onset"],
  },
  // Surprise / new info.
  {
    pattern: /\b(wait,|really\?|are you serious|i didn'?t know|that'?s surprising)\b/i,
    delta: { emotion: { surprise: 0.18 }, arousal: 0.05 },
    cues: ["brow_flash"],
  },
  // Disagreement prompt — a head shake.
  {
    pattern: /\b(do you (agree|disagree)|is that (right|wrong)|don'?t you think)\b/i,
    delta: {},
    cues: ["shake_head"],
  },
];

const MAX_CUES = 2;

/**
 * Scan a (new) chunk of trainee speech and return an aggregated appraisal delta +
 * a small set of reaction cues, or null if nothing matched.
 */
export function tagReaction(text: string): { delta: AppraisalDelta; cues: ReactionCue[] } | null {
  if (!text.trim()) return null;

  const emotion: NonNullable<AppraisalDelta["emotion"]> = {};
  let arousal = 0;
  let rapport = 0;
  let matched = false;
  const cues: ReactionCue[] = [];

  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    matched = true;
    if (rule.delta.emotion) {
      for (const [axis, value] of Object.entries(rule.delta.emotion)) {
        emotion[axis as keyof typeof emotion] =
          (emotion[axis as keyof typeof emotion] ?? 0) + (value ?? 0);
      }
    }
    arousal += rule.delta.arousal ?? 0;
    rapport += rule.delta.rapport ?? 0;
    for (const cue of rule.cues) {
      if (!cues.includes(cue) && cues.length < MAX_CUES) cues.push(cue);
    }
  }

  if (!matched) return null;

  return {
    delta: {
      emotion: Object.keys(emotion).length > 0 ? emotion : undefined,
      arousal: arousal !== 0 ? arousal : undefined,
      rapport: rapport !== 0 ? rapport : undefined,
      weight: 0.6, // partials are uncertain; integrate gently
    },
    cues,
  };
}

/** Return the portion of `current` not yet seen in `previous` (prefix-aware). */
export function newTranscriptText(previous: string, current: string): string {
  if (current.startsWith(previous)) return current.slice(previous.length);
  return current; // partial reset/correction — re-scan the whole thing
}

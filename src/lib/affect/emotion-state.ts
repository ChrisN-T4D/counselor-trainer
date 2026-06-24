import { z } from "zod";
import {
  EKMAN_AXES,
  addScaledEmotion,
  clamp01,
  clampEmotion,
  zeroEmotion,
  type EmotionVector,
} from "./emotion";
import {
  DEFAULT_EXPRESSIVITY_PROFILE,
  type ExpressivityProfile,
} from "./expressivity-profile";

// The persisted, slow-moving client affect state. `felt` is the internal
// emotion; `arousal` is overall activation; `rapport` is the (non-Ekman)
// therapeutic alliance scalar that gates engagement + reaction sensitivity.

export const emotionStateSchema = z.object({
  felt: z.object({
    anger: z.number(),
    disgust: z.number(),
    fear: z.number(),
    sadness: z.number(),
    enjoyment: z.number(),
    surprise: z.number(),
    contempt: z.number(),
  }),
  arousal: z.number().min(0).max(1),
  rapport: z.number().min(0).max(1),
});

export type ClientEmotionState = z.infer<typeof emotionStateSchema>;

/** A unit of appraisal: a felt-emotion delta plus optional arousal/rapport nudges. */
export type AppraisalDelta = {
  emotion?: Partial<EmotionVector>;
  arousal?: number;
  rapport?: number;
  /** Scales the emotion delta before profile reactivity (0..1 confidence). */
  weight?: number;
};

/** Discrete, short-lived reaction cues that drive ReactionController pulses. */
export const REACTION_CUES = [
  "flinch",
  "wince",
  "recoil",
  "brow_flash",
  "tear_onset",
  "nod",
  "shake_head",
  "look_away",
  "soften",
  "freeze",
] as const;

export type ReactionCue = (typeof REACTION_CUES)[number];

export function initialEmotionState(profile: ExpressivityProfile): ClientEmotionState {
  return {
    felt: clampEmotion(profile.baseline),
    arousal: profile.arousalBaseline,
    rapport: 0.45,
  };
}

/** Apply an appraisal delta to felt emotion, scaled by profile reactivity. */
export function applyAppraisal(
  state: ClientEmotionState,
  delta: AppraisalDelta,
  profile: ExpressivityProfile,
): ClientEmotionState {
  const weight = clamp01(delta.weight ?? 1);
  const scale = profile.reactivity * weight;
  const felt = delta.emotion ? addScaledEmotion(state.felt, delta.emotion, scale) : state.felt;

  let arousal = state.arousal;
  if (typeof delta.arousal === "number") {
    arousal = clamp01(arousal + delta.arousal * weight);
  }
  let rapport = state.rapport;
  if (typeof delta.rapport === "number") {
    // Rapport moves slowly and is not scaled by reactivity.
    rapport = clamp01(rapport + delta.rapport);
  }
  return { felt, arousal, rapport };
}

/** Decay felt emotion + arousal toward the profile baselines over `dtSeconds`. */
export function decayTowardBaseline(
  state: ClientEmotionState,
  profile: ExpressivityProfile,
  dtSeconds: number,
): ClientEmotionState {
  const alpha = dtSeconds > 0 ? 1 - Math.exp(-dtSeconds * profile.decayRate) : 0;
  const felt = zeroEmotion();
  for (const axis of EKMAN_AXES) {
    const current = state.felt[axis] ?? 0;
    const target = profile.baseline[axis] ?? 0;
    felt[axis] = clamp01(current + (target - current) * alpha);
  }
  const arousal = clamp01(
    state.arousal + (profile.arousalBaseline - state.arousal) * alpha,
  );
  return { felt, arousal, rapport: state.rapport };
}

/**
 * The displayed affect = felt ⊙ gain ⊙ expressiveness, with leak channels keeping
 * a floor so suppressed emotions still micro-express. Returns a vector the
 * renderer turns into blendshapes plus the arousal used to scale motion gain.
 */
export function getDisplayed(
  state: ClientEmotionState,
  profile: ExpressivityProfile,
): { vector: EmotionVector; arousal: number } {
  const vector = zeroEmotion();
  for (const axis of EKMAN_AXES) {
    const felt = state.felt[axis] ?? 0;
    const gain = profile.gain[axis] ?? 1;
    let shown = felt * gain * profile.expressiveness;
    if (profile.leakChannels.includes(axis)) {
      // Leak: at least a fraction of felt shows regardless of low gain.
      shown = Math.max(shown, felt * 0.4);
    }
    vector[axis] = clamp01(shown);
  }
  // Arousal scales overall display gain a touch (energized = more expressive).
  const arousal = clamp01(state.arousal);
  return { vector, arousal };
}

export function parseStoredEmotionState(value: unknown): ClientEmotionState {
  return emotionStateSchema.parse(value);
}

/** The felt-affect a client reply reports (Ekman vector + arousal + rapport delta). */
export type ReplyAffect = {
  vector: Partial<EmotionVector>;
  arousal?: number;
  rapport?: number;
};

/**
 * Fold an LLM reply's reported affect into the persisted state: blend felt toward
 * the reported vector, ease arousal toward the reported level, apply rapport delta.
 * This is the slow, authoritative update persisted between turns.
 */
export function applyReplyAffect(
  state: ClientEmotionState,
  affect: ReplyAffect,
  strength = 0.7,
): ClientEmotionState {
  const k = clamp01(strength);
  const target = { ...zeroEmotion(), ...affect.vector } as EmotionVector;
  const felt = zeroEmotion();
  for (const axis of EKMAN_AXES) {
    felt[axis] = clamp01((state.felt[axis] ?? 0) * (1 - k) + (target[axis] ?? 0) * k);
  }
  const arousal =
    typeof affect.arousal === "number"
      ? clamp01(state.arousal * (1 - k) + affect.arousal * k)
      : state.arousal;
  const rapport =
    typeof affect.rapport === "number" ? clamp01(state.rapport + affect.rapport) : state.rapport;
  return { felt, arousal, rapport };
}

// ---------------------------------------------------------------------------
// Runtime controller — a framework-agnostic integrator used on the client to
// drive the avatar in real time. Owns the canonical state + profile, applies
// appraisals/prosody nudges as they arrive, and decays toward baseline on a
// tick. Emits the *displayed* vector when it changes meaningfully so the React
// layer can push it to the avatar without per-frame churn.
// ---------------------------------------------------------------------------

export type DisplayedAffect = { vector: EmotionVector; arousal: number; rapport: number };

type ControllerOptions = {
  profile?: ExpressivityProfile;
  initial?: ClientEmotionState;
  /** Min change in summed vector before onDisplayChange fires. */
  emitThreshold?: number;
  onDisplayChange?: (displayed: DisplayedAffect) => void;
};

export class EmotionStateController {
  private profile: ExpressivityProfile;
  private state: ClientEmotionState;
  private lastEmitted: EmotionVector = zeroEmotion();
  private emitThreshold: number;
  private onDisplayChange?: (displayed: DisplayedAffect) => void;

  constructor(options: ControllerOptions = {}) {
    this.profile = options.profile ?? DEFAULT_EXPRESSIVITY_PROFILE;
    this.state = options.initial ?? initialEmotionState(this.profile);
    this.emitThreshold = options.emitThreshold ?? 0.04;
    this.onDisplayChange = options.onDisplayChange;
  }

  setProfile(profile: ExpressivityProfile): void {
    this.profile = profile;
  }

  getProfile(): ExpressivityProfile {
    return this.profile;
  }

  getState(): ClientEmotionState {
    return this.state;
  }

  loadState(state: ClientEmotionState): void {
    this.state = state;
    this.emit(true);
  }

  /** Blend felt toward a target vector (used for the LLM reply's considered affect). */
  setFeltTarget(target: Partial<EmotionVector>, strength = 0.6): void {
    const full = { ...zeroEmotion(), ...target } as EmotionVector;
    const k = clamp01(strength);
    const next = zeroEmotion();
    for (const axis of EKMAN_AXES) {
      next[axis] = clamp01((this.state.felt[axis] ?? 0) * (1 - k) + (full[axis] ?? 0) * k);
    }
    this.state = { ...this.state, felt: next };
    this.emit(false);
  }

  applyAppraisal(delta: AppraisalDelta): void {
    this.state = applyAppraisal(this.state, delta, this.profile);
    this.emit(false);
  }

  /** Prosody hook: nudge arousal (and optionally rapport) without semantic content. */
  nudgeArousal(amount: number): void {
    this.state = {
      ...this.state,
      arousal: clamp01(this.state.arousal + amount),
    };
    // Arousal changes alone rarely cross the vector threshold; emit so motion gain updates.
    this.emit(true);
  }

  setRapport(value: number): void {
    this.state = { ...this.state, rapport: clamp01(value) };
  }

  /** Advance decay; call from a timer (~150-250ms) or rAF. */
  update(dtSeconds: number): void {
    this.state = decayTowardBaseline(this.state, this.profile, dtSeconds);
    this.emit(false);
  }

  getDisplayed(): DisplayedAffect {
    const { vector, arousal } = getDisplayed(this.state, this.profile);
    return { vector, arousal, rapport: this.state.rapport };
  }

  private emit(force: boolean): void {
    if (!this.onDisplayChange) return;
    const { vector, arousal } = getDisplayed(this.state, this.profile);
    let diff = 0;
    for (const axis of EKMAN_AXES) diff += Math.abs((vector[axis] ?? 0) - (this.lastEmitted[axis] ?? 0));
    if (force || diff >= this.emitThreshold) {
      this.lastEmitted = vector;
      this.onDisplayChange({ vector, arousal, rapport: this.state.rapport });
    }
  }
}

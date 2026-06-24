// Ekman's 7 basic emotions as the client's affect "spider graph" axes. Each axis
// is an intensity in 0..1; a client state is a vector over all seven (blends are
// just multiple non-zero axes). Framework-agnostic (no three.js / React) so the
// server appraisal loop and the client renderer share one source of truth.

export const EKMAN_AXES = [
  "anger",
  "disgust",
  "fear",
  "sadness",
  "enjoyment",
  "surprise",
  "contempt",
] as const;

export type Ekman7Axis = (typeof EKMAN_AXES)[number];

export type EmotionVector = Record<Ekman7Axis, number>;

export function zeroEmotion(): EmotionVector {
  return { anger: 0, disgust: 0, fear: 0, sadness: 0, enjoyment: 0, surprise: 0, contempt: 0 };
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function clampEmotion(v: EmotionVector): EmotionVector {
  const out = zeroEmotion();
  for (const axis of EKMAN_AXES) out[axis] = clamp01(v[axis] ?? 0);
  return out;
}

/** Linear interpolate a -> b by t (0..1). */
export function blendEmotion(a: EmotionVector, b: EmotionVector, t: number): EmotionVector {
  const k = clamp01(t);
  const out = zeroEmotion();
  for (const axis of EKMAN_AXES) out[axis] = (a[axis] ?? 0) * (1 - k) + (b[axis] ?? 0) * k;
  return clampEmotion(out);
}

/** Ease `v` toward `target` with a frame-rate-independent time constant `tau` (s). */
export function easeEmotion(
  v: EmotionVector,
  target: EmotionVector,
  tauSeconds: number,
  dtSeconds: number,
): EmotionVector {
  const alpha = tauSeconds > 0 && dtSeconds > 0 ? 1 - Math.exp(-dtSeconds / tauSeconds) : 1;
  return blendEmotion(v, target, alpha);
}

/** Add a (possibly partial) delta, scaled, in place of a new vector. */
export function addScaledEmotion(
  v: EmotionVector,
  delta: Partial<EmotionVector>,
  scale: number,
): EmotionVector {
  const out = zeroEmotion();
  for (const axis of EKMAN_AXES) out[axis] = (v[axis] ?? 0) + (delta[axis] ?? 0) * scale;
  return clampEmotion(out);
}

export function dominantAxis(v: EmotionVector): { axis: Ekman7Axis; value: number } {
  let best: Ekman7Axis = "enjoyment";
  let bestVal = -1;
  for (const axis of EKMAN_AXES) {
    if ((v[axis] ?? 0) > bestVal) {
      bestVal = v[axis] ?? 0;
      best = axis;
    }
  }
  return { axis: best, value: bestVal < 0 ? 0 : bestVal };
}

export function emotionMagnitude(v: EmotionVector): number {
  let sum = 0;
  for (const axis of EKMAN_AXES) sum += v[axis] ?? 0;
  return sum;
}

// Common two-emotion blends, used as vocabulary for appraisal / the prompt and
// for human-readable debugging. Each names the pair of axes that compose it.
export const EMOTION_DYADS: Record<string, [Ekman7Axis, Ekman7Axis]> = {
  shame: ["sadness", "disgust"],
  remorse: ["sadness", "disgust"],
  alarm: ["fear", "surprise"],
  outrage: ["anger", "surprise"],
  resentment: ["anger", "disgust"],
  despair: ["sadness", "fear"],
  bittersweet: ["enjoyment", "sadness"],
};

/** Best-fit human label: a dyad if two axes are co-dominant, else the top axis. */
export function describeEmotion(v: EmotionVector): string {
  const sorted = [...EKMAN_AXES].sort((a, b) => (v[b] ?? 0) - (v[a] ?? 0));
  const [a, b] = sorted;
  const top = v[a] ?? 0;
  const second = v[b] ?? 0;
  if (top < 0.15) return "neutral";
  if (second > 0.4 * top && second > 0.2) {
    for (const [name, [x, y]] of Object.entries(EMOTION_DYADS)) {
      if ((x === a && y === b) || (x === b && y === a)) return name;
    }
  }
  return a;
}

// ---------------------------------------------------------------------------
// Per-axis facial blendshape templates (ARKit naming, as exposed by RPM /
// AvatarSDK avatars). Weights are the morph influence at full axis intensity
// (1.0). The renderer blends these by the displayed emotion vector. This is the
// canonical mapping; expression-controller.ts consumes it.
//
// NOTE: mouth-open shapes (viseme_*, jawOpen) are deliberately excluded — those
// are owned by the lip-sync player so affect never fights speech.
// ---------------------------------------------------------------------------
export const EMOTION_BLENDSHAPES: Record<Ekman7Axis, Record<string, number>> = {
  anger: {
    browDownLeft: 0.6,
    browDownRight: 0.6,
    mouthPressLeft: 0.35,
    mouthPressRight: 0.35,
    noseSneerLeft: 0.25,
    noseSneerRight: 0.25,
    eyeSquintLeft: 0.2,
    eyeSquintRight: 0.2,
  },
  disgust: {
    noseSneerLeft: 0.5,
    noseSneerRight: 0.5,
    browDownLeft: 0.3,
    browDownRight: 0.3,
    mouthShrugUpper: 0.25,
    eyeSquintLeft: 0.2,
    eyeSquintRight: 0.2,
  },
  fear: {
    browInnerUp: 0.5,
    browOuterUpLeft: 0.35,
    browOuterUpRight: 0.35,
    eyeWideLeft: 0.5,
    eyeWideRight: 0.5,
    mouthStretchLeft: 0.2,
    mouthStretchRight: 0.2,
  },
  sadness: {
    browInnerUp: 0.6,
    mouthFrownLeft: 0.45,
    mouthFrownRight: 0.45,
    eyeSquintLeft: 0.12,
    eyeSquintRight: 0.12,
    mouthShrugLower: 0.15,
  },
  enjoyment: {
    mouthSmileLeft: 0.5,
    mouthSmileRight: 0.5,
    cheekSquintLeft: 0.25,
    cheekSquintRight: 0.25,
    browInnerUp: 0.05,
  },
  surprise: {
    browInnerUp: 0.45,
    browOuterUpLeft: 0.45,
    browOuterUpRight: 0.45,
    eyeWideLeft: 0.55,
    eyeWideRight: 0.55,
  },
  // Contempt is canonically unilateral (one-sided lip raise / tightening).
  contempt: {
    mouthSmileLeft: 0.35,
    mouthPressLeft: 0.3,
    noseSneerLeft: 0.25,
    eyeSquintLeft: 0.2,
    browDownLeft: 0.15,
  },
};

/** Blend the per-axis templates by a displayed emotion vector -> morph weights. */
export function emotionToBlendshapes(displayed: EmotionVector): Record<string, number> {
  const out: Record<string, number> = {};
  for (const axis of EKMAN_AXES) {
    const intensity = clamp01(displayed[axis] ?? 0);
    if (intensity <= 0) continue;
    const template = EMOTION_BLENDSHAPES[axis];
    for (const [morph, weight] of Object.entries(template)) {
      const contribution = weight * intensity;
      // Take the strongest contribution per morph (avoids summing past 1 and
      // keeps blends readable; clamp guards anyway).
      out[morph] = Math.min(1, Math.max(out[morph] ?? 0, contribution));
    }
  }
  return out;
}

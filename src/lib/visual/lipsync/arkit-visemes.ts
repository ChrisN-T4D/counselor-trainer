import type { VisemeName } from "./types";

/**
 * Mapping from ARKit blendshape channels (as produced by NVIDIA Audio2Face-3D)
 * to this app's Oculus visemes, used to normalize A2F output to the shared
 * `VisemeTimeline`. Mouth-relevant subset; the dominant mouth channel per A2F
 * frame becomes that frame's viseme.
 *
 * Lives in its own module (not the route) because Next.js route files may only
 * export HTTP handlers + a few config names. Consumed by the future
 * Audio2Face-3D implementation (see src/app/api/lipsync/route.ts).
 */
export const ARKIT_TO_OCULUS: Record<string, VisemeName> = {
  jawOpen: "viseme_aa",
  mouthFunnel: "viseme_O",
  mouthPucker: "viseme_U",
  mouthClose: "viseme_PP",
  mouthPressLeft: "viseme_PP",
  mouthPressRight: "viseme_PP",
  mouthShrugUpper: "viseme_FF",
  mouthStretchLeft: "viseme_I",
  mouthStretchRight: "viseme_I",
  tongueOut: "viseme_TH",
};

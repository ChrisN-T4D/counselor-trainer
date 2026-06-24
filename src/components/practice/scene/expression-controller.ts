"use client";

import type { AvatarMood } from "@/lib/visual/types";

type MorphMesh = {
  dictionary: Record<string, number>;
  influences: number[];
};

type MorphTarget = { influences: number[]; index: number };

/**
 * Per-mood facial blendshape weights (ARKit naming, as exposed by RPM /
 * AvatarSDK avatars). Intensities are deliberately moderate so the face reads as
 * the emotion without grimacing, and so it layers cleanly over visemes.
 *
 * IMPORTANT: this controller only owns brows, eyes (squint/wide), and
 * mouth-corner / nose morphs. The mouth-open shapes (`viseme_*`, `jawOpen`) are
 * owned by {@link VisemePlayer} so the two never fight for the mouth.
 */
const MOOD_EXPRESSIONS: Record<AvatarMood, Record<string, number>> = {
  neutral: {},
  happy: {
    mouthSmileLeft: 0.5,
    mouthSmileRight: 0.5,
    cheekSquintLeft: 0.25,
    cheekSquintRight: 0.25,
    browInnerUp: 0.05,
  },
  sad: {
    browInnerUp: 0.6,
    mouthFrownLeft: 0.45,
    mouthFrownRight: 0.45,
    eyeSquintLeft: 0.12,
    eyeSquintRight: 0.12,
    mouthShrugLower: 0.15,
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
  angry: {
    browDownLeft: 0.6,
    browDownRight: 0.6,
    mouthPressLeft: 0.35,
    mouthPressRight: 0.35,
    noseSneerLeft: 0.25,
    noseSneerRight: 0.25,
    eyeSquintLeft: 0.2,
    eyeSquintRight: 0.2,
  },
  love: {
    mouthSmileLeft: 0.35,
    mouthSmileRight: 0.35,
    cheekSquintLeft: 0.2,
    cheekSquintRight: 0.2,
    browInnerUp: 0.1,
  },
  disgust: {
    noseSneerLeft: 0.5,
    noseSneerRight: 0.5,
    browDownLeft: 0.35,
    browDownRight: 0.35,
    mouthShrugUpper: 0.25,
    eyeSquintLeft: 0.2,
    eyeSquintRight: 0.2,
  },
  sleep: {
    eyeSquintLeft: 0.3,
    eyeSquintRight: 0.3,
    browInnerUp: 0.1,
  },
};

/** Every morph any mood touches — the set we ease toward/away from each frame. */
const ALL_EXPRESSION_MORPHS = Array.from(
  new Set(Object.values(MOOD_EXPRESSIONS).flatMap((m) => Object.keys(m))),
);

// How fast the face eases toward its target expression (seconds, ~time constant).
const EASE_TAU = 0.28;

/**
 * Eases an avatar's emotional expression (brows / eyes / mouth-corners) toward a
 * mood-driven target and back to rest, defensively driving only morphs that
 * exist on the given meshes. Designed to be `update(dt)`-driven alongside the
 * viseme player so the two layer without conflict.
 */
export class ExpressionController {
  private readonly targets: Map<string, MorphTarget[]> = new Map();
  private readonly current: Map<string, number> = new Map();
  private mood: AvatarMood = "neutral";

  constructor(meshes: MorphMesh[]) {
    for (const name of ALL_EXPRESSION_MORPHS) {
      const collected: MorphTarget[] = [];
      for (const mesh of meshes) {
        const index = mesh.dictionary[name];
        if (index !== undefined) collected.push({ influences: mesh.influences, index });
      }
      if (collected.length > 0) {
        this.targets.set(name, collected);
        this.current.set(name, 0);
      }
    }
  }

  /** Set the expression to ease toward. Reverts to `neutral` between utterances. */
  setMood(mood: AvatarMood) {
    this.mood = mood;
  }

  /** Names of expression morphs actually present on this avatar (dev/probe use). */
  presentMorphs(): string[] {
    return Array.from(this.targets.keys());
  }

  update(dt: number) {
    if (this.targets.size === 0) return;
    const goal = MOOD_EXPRESSIONS[this.mood] ?? {};
    // Exponential smoothing toward the target weight (frame-rate independent).
    const alpha = dt > 0 ? 1 - Math.exp(-dt / EASE_TAU) : 1;

    for (const [name, targets] of this.targets) {
      const want = goal[name] ?? 0;
      const prev = this.current.get(name) ?? 0;
      const next = prev + (want - prev) * alpha;
      this.current.set(name, next);
      for (const t of targets) t.influences[t.index] = next;
    }
  }

  /** Ease everything back to rest immediately on the next frames. */
  reset() {
    this.mood = "neutral";
  }
}

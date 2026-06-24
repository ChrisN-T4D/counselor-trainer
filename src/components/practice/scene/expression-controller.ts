"use client";

import type { AvatarMood } from "@/lib/visual/types";
import {
  EMOTION_BLENDSHAPES,
  clamp01,
  emotionToBlendshapes,
  zeroEmotion,
  type EmotionVector,
} from "@/lib/affect/emotion";

type MorphMesh = {
  dictionary: Record<string, number>;
  influences: number[];
};

type MorphTarget = { influences: number[]; index: number };

/**
 * Coarse AvatarMood -> Ekman emotion vector, so legacy `setMood` callers (and the
 * TalkingHead-style mood derived from delivery tags) still work while the engine
 * renders everything through the same vector path.
 */
const MOOD_TO_VECTOR: Record<AvatarMood, Partial<EmotionVector>> = {
  neutral: {},
  happy: { enjoyment: 1 },
  love: { enjoyment: 0.7 },
  sad: { sadness: 1 },
  fear: { fear: 1 },
  angry: { anger: 1 },
  disgust: { disgust: 1 },
  sleep: { sadness: 0.25 },
};

/** Every morph the emotion templates can touch — the set we ease toward/away from. */
const ALL_EXPRESSION_MORPHS = Array.from(
  new Set(Object.values(EMOTION_BLENDSHAPES).flatMap((m) => Object.keys(m))),
);

// How fast the face eases toward its target expression (seconds, ~time constant).
const EASE_TAU = 0.28;

/**
 * Eases an avatar's emotional expression (brows / eyes / mouth-corners) toward a
 * target driven by an Ekman emotion **vector** (felt ⊙ gain = displayed) and back
 * to rest, defensively driving only morphs that exist on the given meshes.
 * `update(dt)`-driven alongside the viseme player so the two layer without
 * conflict (mouth-open shapes stay owned by the player).
 */
export class ExpressionController {
  private readonly targets: Map<string, MorphTarget[]> = new Map();
  private readonly current: Map<string, number> = new Map();
  private goal: Record<string, number> = {};

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

  /** Drive the face from a displayed emotion vector. `gain` scales overall intensity. */
  setAffectVector(vector: EmotionVector, gain = 1) {
    const blended = emotionToBlendshapes(vector);
    const goal: Record<string, number> = {};
    for (const [morph, weight] of Object.entries(blended)) {
      goal[morph] = clamp01(weight * gain);
    }
    this.goal = goal;
  }

  /** Back-compat: set a coarse mood, mapped onto the vector path. */
  setMood(mood: AvatarMood) {
    const vector = { ...zeroEmotion(), ...MOOD_TO_VECTOR[mood] } as EmotionVector;
    this.setAffectVector(vector, 1);
  }

  /** Names of expression morphs actually present on this avatar (dev/probe use). */
  presentMorphs(): string[] {
    return Array.from(this.targets.keys());
  }

  update(dt: number) {
    if (this.targets.size === 0) return;
    // Exponential smoothing toward the target weight (frame-rate independent).
    const alpha = dt > 0 ? 1 - Math.exp(-dt / EASE_TAU) : 1;

    for (const [name, targets] of this.targets) {
      const want = this.goal[name] ?? 0;
      const prev = this.current.get(name) ?? 0;
      const next = prev + (want - prev) * alpha;
      this.current.set(name, next);
      for (const t of targets) t.influences[t.index] = next;
    }
  }

  /** Ease everything back to rest immediately on the next frames. */
  reset() {
    this.goal = {};
  }
}

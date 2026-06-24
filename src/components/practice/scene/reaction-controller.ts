"use client";

import type { ReactionCue } from "@/lib/affect/emotion-state";

type MorphMesh = {
  dictionary: Record<string, number>;
  influences: number[];
};

type MorphTarget = { influences: number[]; index: number };

type PulseTemplate = {
  weights: Record<string, number>;
  attack: number; // seconds to peak
  decay: number; // seconds peak -> 0
};

/**
 * Short, transient facial reactions (attack/decay) layered ON TOP of the
 * sustained expression. Because {@link ExpressionController} assigns morph
 * influences each frame and this controller *adds* to them, it must run AFTER the
 * expression update in the frame loop so the pulse rides on the steady face.
 *
 * Motion cues (nod / shake_head / look_away) are not facial and are routed to the
 * idle/gaze controllers by the avatar layer; this controller ignores them.
 */
const PULSE_TEMPLATES: Partial<Record<ReactionCue, PulseTemplate>> = {
  flinch: {
    weights: {
      eyeBlinkLeft: 0.9,
      eyeBlinkRight: 0.9,
      eyeSquintLeft: 0.5,
      eyeSquintRight: 0.5,
      browDownLeft: 0.3,
      browDownRight: 0.3,
    },
    attack: 0.06,
    decay: 0.28,
  },
  wince: {
    weights: {
      eyeSquintLeft: 0.6,
      eyeSquintRight: 0.6,
      browDownLeft: 0.4,
      browDownRight: 0.4,
      mouthPressLeft: 0.3,
      mouthPressRight: 0.3,
    },
    attack: 0.12,
    decay: 0.5,
  },
  recoil: {
    weights: { eyeWideLeft: 0.6, eyeWideRight: 0.6, browInnerUp: 0.4 },
    attack: 0.08,
    decay: 0.45,
  },
  brow_flash: {
    weights: { browInnerUp: 0.5, browOuterUpLeft: 0.5, browOuterUpRight: 0.5 },
    attack: 0.1,
    decay: 0.4,
  },
  tear_onset: {
    weights: { browInnerUp: 0.6, eyeWideLeft: 0.2, eyeWideRight: 0.2 },
    attack: 0.4,
    decay: 1.2,
  },
  soften: {
    weights: { mouthSmileLeft: 0.25, mouthSmileRight: 0.25, browInnerUp: 0.2 },
    attack: 0.3,
    decay: 1.0,
  },
};

type ActivePulse = { template: PulseTemplate; elapsed: number };

const MAX_ACTIVE = 4;

export class ReactionController {
  private readonly targets: Map<string, MorphTarget[]> = new Map();
  private pulses: ActivePulse[] = [];

  constructor(meshes: MorphMesh[]) {
    const morphs = new Set<string>();
    for (const tpl of Object.values(PULSE_TEMPLATES)) {
      if (tpl) for (const m of Object.keys(tpl.weights)) morphs.add(m);
    }
    for (const name of morphs) {
      const collected: MorphTarget[] = [];
      for (const mesh of meshes) {
        const index = mesh.dictionary[name];
        if (index !== undefined) collected.push({ influences: mesh.influences, index });
      }
      if (collected.length > 0) this.targets.set(name, collected);
    }
  }

  /** True for cues this controller renders facially (vs motion cues handled elsewhere). */
  static isFacialCue(cue: ReactionCue): boolean {
    return Boolean(PULSE_TEMPLATES[cue]);
  }

  triggerReaction(cue: ReactionCue) {
    const template = PULSE_TEMPLATES[cue];
    if (!template || this.targets.size === 0) return;
    if (this.pulses.length >= MAX_ACTIVE) this.pulses.shift();
    this.pulses.push({ template, elapsed: 0 });
  }

  private envelope(p: ActivePulse): number {
    const { attack, decay } = p.template;
    if (p.elapsed < attack) return attack > 0 ? p.elapsed / attack : 1;
    const t = p.elapsed - attack;
    if (t < decay) return decay > 0 ? 1 - t / decay : 0;
    return 0;
  }

  /** Add active pulses on top of whatever the expression set this frame. */
  update(dt: number) {
    if (this.pulses.length === 0 || dt <= 0) return;

    const additive: Record<string, number> = {};
    const next: ActivePulse[] = [];
    for (const p of this.pulses) {
      p.elapsed += dt;
      const env = this.envelope(p);
      if (p.elapsed >= p.template.attack + p.template.decay) continue;
      next.push(p);
      for (const [morph, weight] of Object.entries(p.template.weights)) {
        additive[morph] = Math.max(additive[morph] ?? 0, weight * env);
      }
    }
    this.pulses = next;

    for (const [name, targets] of this.targets) {
      const add = additive[name];
      if (add === undefined) continue;
      for (const t of targets) {
        t.influences[t.index] = Math.min(1, t.influences[t.index] + add);
      }
    }
  }

  dispose() {
    this.pulses = [];
  }
}

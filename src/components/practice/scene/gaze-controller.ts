"use client";

import { Quaternion, Vector3, type Object3D } from "three";
import type { AvatarMood } from "@/lib/visual/types";
import { clamp01, type EmotionVector } from "@/lib/affect/emotion";

const X = new Vector3(1, 0, 0); // pitch (look up/down)
const Y = new Vector3(0, 1, 0); // yaw (look left/right)

// Eye-rotation limits (radians). Kept small — eyes, not head.
const MAX_YAW = 0.18;
const MAX_PITCH = 0.12;
// How fast the eyes ease toward the current gaze target.
const EASE_TAU = 0.06;

const DISTRESSED: ReadonlySet<AvatarMood> = new Set(["sad", "fear", "angry", "disgust"]);

type EyeMorph = { influences: number[]; index: number };

type MorphMesh = {
  dictionary: Record<string, number>;
  influences: number[];
};

/**
 * Drives subtle, lifelike eye behavior: micro-saccades around eye-contact with
 * the trainee, plus **gaze aversion** (look down / away) when the client is
 * distressed. Eye-contact is the rig's rest orientation, since the seated avatar
 * is posed facing the camera; saccades and aversion are offsets from it.
 *
 * Prefers rotating the `LeftEye`/`RightEye` bones; falls back to ARKit
 * `eyeLook*` morphs when present. Blinking stays owned by `VisemePlayer`.
 */
export class GazeController {
  private readonly leftEye: Object3D | null;
  private readonly rightEye: Object3D | null;
  private readonly baseLeft = new Quaternion();
  private readonly baseRight = new Quaternion();
  private readonly delta = new Quaternion();
  private readonly qYaw = new Quaternion();
  private readonly qPitch = new Quaternion();

  // ARKit morph fallback (when there are no eye bones).
  private readonly lookMorphs: {
    inL: EyeMorph[];
    outL: EyeMorph[];
    upL: EyeMorph[];
    downL: EyeMorph[];
    inR: EyeMorph[];
    outR: EyeMorph[];
    upR: EyeMorph[];
    downR: EyeMorph[];
  } | null;

  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private clock = 0;
  private nextSaccadeAt = 0.6 + Math.random() * 1.2;
  // Probability (0..1) the next saccade is a gaze aversion. Driven by the affect
  // vector + rapport when the affect channel is active; else derived from mood.
  private aversion = 0;
  private affectDriven = false;

  constructor(root: Object3D, meshes: MorphMesh[] = []) {
    const byName: Record<string, Object3D> = {};
    root.traverse((o) => {
      byName[o.name] = o;
    });
    this.leftEye = byName.LeftEye ?? byName.Eye_L ?? byName.eyeLeft ?? null;
    this.rightEye = byName.RightEye ?? byName.Eye_R ?? byName.eyeRight ?? null;
    if (this.leftEye) this.baseLeft.copy(this.leftEye.quaternion);
    if (this.rightEye) this.baseRight.copy(this.rightEye.quaternion);

    this.lookMorphs =
      !this.leftEye && !this.rightEye ? this.collectLookMorphs(meshes) : null;
  }

  private collectLookMorphs(meshes: MorphMesh[]) {
    const get = (name: string): EyeMorph[] => {
      const out: EyeMorph[] = [];
      for (const mesh of meshes) {
        const index = mesh.dictionary[name];
        if (index !== undefined) out.push({ influences: mesh.influences, index });
      }
      return out;
    };
    const morphs = {
      inL: get("eyeLookInLeft"),
      outL: get("eyeLookOutLeft"),
      upL: get("eyeLookUpLeft"),
      downL: get("eyeLookDownLeft"),
      inR: get("eyeLookInRight"),
      outR: get("eyeLookOutRight"),
      upR: get("eyeLookUpRight"),
      downR: get("eyeLookDownRight"),
    };
    const any = Object.values(morphs).some((m) => m.length > 0);
    return any ? morphs : null;
  }

  /** True if this avatar exposes any drivable eye bones / look morphs. */
  get active(): boolean {
    return Boolean(this.leftEye || this.rightEye || this.lookMorphs);
  }

  /**
   * Set gaze behavior from the displayed affect vector + rapport. Aversion (look
   * down/away) rises with fear/sadness/contempt and falls with rapport; high
   * enjoyment keeps warm eye contact.
   */
  setAffect(vector: EmotionVector, rapport: number) {
    this.affectDriven = true;
    const distress = 0.6 * (vector.fear ?? 0) + 0.5 * (vector.sadness ?? 0) + 0.45 * (vector.contempt ?? 0);
    const lowRapport = 0.5 - clamp01(rapport); // >0 when rapport below midpoint
    const warmth = 0.4 * (vector.enjoyment ?? 0);
    this.aversion = clamp01(distress + Math.max(0, lowRapport) * 0.6 - warmth);
  }

  /** One-shot: avert the gaze (look down/away) now, held briefly. */
  lookAway() {
    if (!this.active) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.targetYaw = side * (0.5 + Math.random() * 0.5) * MAX_YAW;
    this.targetPitch = -(0.5 + Math.random() * 0.5) * MAX_PITCH;
    this.nextSaccadeAt = this.clock + 1.0 + Math.random() * 1.2;
  }

  private pickSaccade(aversion: number) {
    if (Math.random() < aversion) {
      // Aversion: glance down and to one side, held a little longer.
      const side = Math.random() < 0.5 ? -1 : 1;
      this.targetYaw = side * (0.45 + Math.random() * 0.5) * MAX_YAW;
      this.targetPitch = -(0.5 + Math.random() * 0.5) * MAX_PITCH; // down
      this.nextSaccadeAt = this.clock + 1.2 + Math.random() * 1.6;
      return;
    }
    // Eye contact with small micro-saccades around center.
    const wide = Math.random() < 0.2;
    const scale = wide ? 0.6 : 0.22;
    this.targetYaw = (Math.random() * 2 - 1) * MAX_YAW * scale;
    this.targetPitch = (Math.random() * 2 - 1) * MAX_PITCH * scale;
    this.nextSaccadeAt = this.clock + 0.5 + Math.random() * 1.8;
  }

  update(dt: number, mood: AvatarMood = "neutral") {
    if (!this.active || dt <= 0) return;
    this.clock += dt;
    if (this.clock >= this.nextSaccadeAt) {
      const aversion = this.affectDriven ? this.aversion : DISTRESSED.has(mood) ? 0.6 : 0;
      this.pickSaccade(aversion);
    }

    // Saccades are fast; ease quickly toward the target then hold (fixation).
    const alpha = 1 - Math.exp(-dt / EASE_TAU);
    this.yaw += (this.targetYaw - this.yaw) * alpha;
    this.pitch += (this.targetPitch - this.pitch) * alpha;

    if (this.leftEye || this.rightEye) {
      this.applyEye(this.leftEye, this.baseLeft);
      this.applyEye(this.rightEye, this.baseRight);
    } else if (this.lookMorphs) {
      this.applyLookMorphs();
    }
  }

  private applyEye(eye: Object3D | null, base: Quaternion) {
    if (!eye) return;
    this.qYaw.setFromAxisAngle(Y, this.yaw);
    this.qPitch.setFromAxisAngle(X, this.pitch);
    this.delta.copy(base).multiply(this.qYaw).multiply(this.qPitch);
    eye.quaternion.copy(this.delta);
  }

  private applyLookMorphs() {
    const m = this.lookMorphs;
    if (!m) return;
    const yawN = this.yaw / MAX_YAW; // -1..1 (negative = subject's left)
    const pitchN = this.pitch / MAX_PITCH; // -1..1 (negative = down)
    const set = (targets: EyeMorph[], v: number) => {
      const c = Math.max(0, Math.min(1, v));
      for (const t of targets) t.influences[t.index] = c;
    };
    // Horizontal: left eye "in" = toward nose (rightward), "out" = leftward.
    set(m.inL, yawN > 0 ? yawN : 0);
    set(m.outL, yawN < 0 ? -yawN : 0);
    set(m.inR, yawN < 0 ? -yawN : 0);
    set(m.outR, yawN > 0 ? yawN : 0);
    // Vertical.
    set(m.upL, pitchN > 0 ? pitchN : 0);
    set(m.downL, pitchN < 0 ? -pitchN : 0);
    set(m.upR, pitchN > 0 ? pitchN : 0);
    set(m.downR, pitchN < 0 ? -pitchN : 0);
  }

  dispose() {
    if (this.leftEye) this.leftEye.quaternion.copy(this.baseLeft);
    if (this.rightEye) this.rightEye.quaternion.copy(this.baseRight);
  }
}

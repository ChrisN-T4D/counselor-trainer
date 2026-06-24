import { Quaternion, Vector3, type Object3D } from "three";

// A subtle, looping "seated idle" applied procedurally on top of whatever baked/posed
// rotation each bone already has. We deliberately avoid loading an external animation
// clip: cross-rig retargeting of foreign CC0 clips onto this RPM/Mixamo skeleton is
// fragile, whereas a few small, well-chosen motions read as a calm, alive person and
// can never break the rig. It only nudges the torso/neck/head — lip-sync drives morph
// targets and gaze drives the eye bones, so the layers never fight.
//
// Layers, all composed per-bone (so multiple contributions add instead of overwriting):
//   1. Oscillators  — breathing + micro head life (sine).
//   2. Slow drift    — weight shift (spine lean), head tilt, head yaw; retargeted on a
//                      slow random cadence and eased, so the pose never sits still.
//   3. Fidget        — rare, brief postural adjustments.
//   4. Cued nods     — short "listening" nods, auto-triggered occasionally and also
//                      exposable via triggerNod() for future dialogue cues.

type Axis = Vector3;

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

// Global pause so the dev Pose Editor can own the bones while it's open (otherwise the
// idle would overwrite spine/neck/head edits every frame and feel "broken").
let idlePaused = false;
export function setIdlePaused(paused: boolean) {
  idlePaused = paused;
}

// Deterministic 0..1 from a string so each avatar gets a stable, distinct phase.
function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

type Oscillator = { axis: Axis; amplitude: number; freq: number; phase: number };

// A slowly-retargeted offset around an axis: drifts to a new small target every
// [minHold, maxHold] seconds and eases there (used for weight shift / tilt / yaw).
class Drift {
  current = 0;
  private target = 0;
  private nextChangeAt: number;

  constructor(
    private readonly amplitude: number,
    private readonly minHold: number,
    private readonly maxHold: number,
    private readonly tau: number,
    seed: number,
  ) {
    this.nextChangeAt = (minHold + (maxHold - minHold) * seed) * 0.5;
  }

  update(clock: number, dt: number) {
    if (clock >= this.nextChangeAt) {
      this.target = (Math.random() * 2 - 1) * this.amplitude;
      this.nextChangeAt = clock + this.minHold + Math.random() * (this.maxHold - this.minHold);
    }
    const alpha = 1 - Math.exp(-dt / this.tau);
    this.current += (this.target - this.current) * alpha;
  }
}

export class SeatedIdle {
  private readonly delta = new Quaternion();
  private readonly start = performance.now() / 1000;
  private lastClock = 0;

  // Tracked bones with their posed base rotation + oscillators.
  private bones: { bone: Object3D; base: Quaternion; oscs: Oscillator[] }[] = [];
  private byName: Record<string, Object3D> = {};
  private readonly phase0: number;

  // Drifts (created only if their bone exists).
  private spineLean: Drift | null = null; // weight shift (Spine, Z)
  private headTilt: Drift | null = null; // head tilt (Head, Z)
  private headYaw: Drift | null = null; // glance around (Head, Y)

  // Transient nod (Head/Neck pitch) and fidget (Spine1 pitch) pulses.
  private nodUntil = 0;
  private nodStart = 0;
  private nextNodAt: number;
  private fidgetUntil = 0;
  private fidgetStart = 0;
  private nextFidgetAt: number;

  constructor(root: Object3D, seed = "") {
    this.phase0 = seedFromString(seed) * Math.PI * 2;
    root.traverse((o) => {
      this.byName[o.name] = o;
    });

    const osc = (
      name: string,
      axis: Axis,
      amplitude: number,
      freq: number,
      phase: number,
    ) => {
      const bone = this.byName[name];
      if (!bone) return;
      let entry = this.bones.find((b) => b.bone === bone);
      if (!entry) {
        entry = { bone, base: bone.quaternion.clone(), oscs: [] };
        this.bones.push(entry);
      }
      entry.oscs.push({ axis, amplitude, freq, phase: this.phase0 + phase });
    };

    // Breathing: chest rises/falls slowly. Spine2 is the upper chest on this rig.
    osc("Spine2", X, 0.018, 0.2, 0);
    osc("Spine1", X, 0.01, 0.2, 0);
    // Gentle weight shift / settle: very slow side lean through the lower spine.
    osc("Spine", Z, 0.012, 0.06, 1.1);
    // Micro head life so the face isn't frozen between utterances.
    osc("Neck", X, 0.012, 0.16, 0.5);
    osc("Head", Y, 0.02, 0.05, 2.0);
    osc("Head", X, 0.012, 0.08, 0.3);

    const s = seedFromString(seed + "drift");
    if (this.byName.Spine) this.spineLean = new Drift(0.03, 8, 16, 2.2, s);
    if (this.byName.Head) {
      this.headTilt = new Drift(0.045, 6, 12, 1.6, (s + 0.33) % 1);
      this.headYaw = new Drift(0.06, 5, 10, 1.4, (s + 0.66) % 1);
    }

    this.nextNodAt = 12 + Math.random() * 12;
    this.nextFidgetAt = 10 + Math.random() * 12;
  }

  /** Trigger a short "listening" nod now (e.g. when the trainee speaks). */
  triggerNod(strength = 1) {
    const now = performance.now() / 1000 - this.start;
    this.nodStart = now;
    this.nodUntil = now + 0.55 * Math.max(0.5, Math.min(1.5, strength));
  }

  update() {
    if (idlePaused) {
      return;
    }
    const clock = performance.now() / 1000 - this.start;
    const dt = this.lastClock ? clock - this.lastClock : 0;
    this.lastClock = clock;

    this.spineLean?.update(clock, dt);
    this.headTilt?.update(clock, dt);
    this.headYaw?.update(clock, dt);

    // Schedule occasional auto-nods and fidgets.
    if (clock >= this.nextNodAt) {
      this.triggerNod(0.7 + Math.random() * 0.5);
      this.nextNodAt = clock + 12 + Math.random() * 16;
    }
    if (clock >= this.nextFidgetAt) {
      this.fidgetStart = clock;
      this.fidgetUntil = clock + 0.7;
      this.nextFidgetAt = clock + 14 + Math.random() * 16;
    }

    const nod = this.pulse(clock, this.nodStart, this.nodUntil) * 0.06; // head pitch
    const fidget = this.pulse(clock, this.fidgetStart, this.fidgetUntil) * 0.015;

    // Compose every tracked bone: base * oscillators * drift/nod/fidget offsets.
    for (const entry of this.bones) {
      entry.bone.quaternion.copy(entry.base);
      for (const o of entry.oscs) {
        const angle = Math.sin(clock * Math.PI * 2 * o.freq + o.phase) * o.amplitude;
        this.delta.setFromAxisAngle(o.axis, angle);
        entry.bone.quaternion.multiply(this.delta);
      }
    }

    this.applyOffset("Spine", Z, this.spineLean?.current ?? 0);
    this.applyOffset("Spine1", X, fidget);
    this.applyOffset("Head", Z, this.headTilt?.current ?? 0);
    this.applyOffset("Head", Y, this.headYaw?.current ?? 0);
    this.applyOffset("Head", X, nod);
    this.applyOffset("Neck", X, nod * 0.4);
  }

  // Half-sine pulse (0 -> 1 -> 0) across an active [start, end] window.
  private pulse(clock: number, start: number, end: number): number {
    if (clock < start || clock > end || end <= start) return 0;
    return Math.sin(((clock - start) / (end - start)) * Math.PI);
  }

  // Add a small extra rotation to a bone that's already been set this frame
  // (composes on top of base + oscillators rather than replacing them).
  private applyOffset(name: string, axis: Axis, angle: number) {
    if (angle === 0) return;
    const bone = this.byName[name];
    if (!bone) return;
    this.delta.setFromAxisAngle(axis, angle);
    bone.quaternion.multiply(this.delta);
  }

  dispose() {
    this.bones = [];
    this.byName = {};
  }
}

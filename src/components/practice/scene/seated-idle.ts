import { Quaternion, Vector3, type Object3D } from "three";

// A subtle, looping "seated idle" applied procedurally on top of whatever baked/posed
// rotation each bone already has. We deliberately avoid loading an external animation
// clip: cross-rig retargeting of foreign CC0 clips onto this RPM/Mixamo skeleton is
// fragile, whereas a few small, well-chosen sine offsets read as a calm, alive person
// and can never break the rig. It only nudges the torso/neck/head — lip-sync drives
// morph targets, not bones, so the two never fight.

type Channel = {
  bone: Object3D;
  base: Quaternion; // the posed rotation we oscillate around
  axis: Vector3;
  amplitude: number; // radians
  freq: number; // Hz
  phase: number; // radians, per-avatar offset so two people don't breathe in sync
};

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

export class SeatedIdle {
  private channels: Channel[] = [];
  private readonly delta = new Quaternion();
  private readonly start = performance.now() / 1000;

  constructor(root: Object3D, seed = "") {
    const phase0 = seedFromString(seed) * Math.PI * 2;
    const byName: Record<string, Object3D> = {};
    root.traverse((o) => {
      byName[o.name] = o;
    });

    const add = (
      name: string,
      axis: Vector3,
      amplitude: number,
      freq: number,
      phase: number,
    ) => {
      const bone = byName[name];
      if (!bone) return;
      this.channels.push({
        bone,
        base: bone.quaternion.clone(),
        axis,
        amplitude,
        freq,
        phase: phase0 + phase,
      });
    };

    // Breathing: chest rises/falls slowly. Spine2 is the upper chest on this rig.
    add("Spine2", X, 0.018, 0.2, 0);
    add("Spine1", X, 0.01, 0.2, 0);
    // Gentle weight shift / settle: very slow side lean through the lower spine.
    add("Spine", Z, 0.012, 0.06, 1.1);
    // Micro head life so the face isn't frozen between utterances.
    add("Neck", X, 0.012, 0.16, 0.5);
    add("Head", Y, 0.02, 0.05, 2.0);
    add("Head", X, 0.012, 0.08, 0.3);
  }

  update() {
    if (idlePaused) {
      return;
    }
    const t = performance.now() / 1000 - this.start;
    for (const ch of this.channels) {
      const angle = Math.sin(t * Math.PI * 2 * ch.freq + ch.phase) * ch.amplitude;
      this.delta.setFromAxisAngle(ch.axis, angle);
      // Apply the oscillation in the bone's local space, relative to its posed base.
      ch.bone.quaternion.copy(ch.base).multiply(this.delta);
    }
  }

  dispose() {
    this.channels = [];
  }
}

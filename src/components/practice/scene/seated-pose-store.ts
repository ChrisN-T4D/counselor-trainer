import type { Object3D } from "three";

// Per-model seated pose overrides, tuned in the in-app Pose Editor and persisted to
// localStorage (keyed by the avatar's GLB URL, so every instance of that model picks
// up the same hand-authored pose). Once a pose looks right it can be copied out of the
// editor and baked into code as a static default.
export type PoseMap = Record<string, [number, number, number]>;

const PREFIX = "seated-pose:";

// Reserved (non-bone) keys inside a PoseMap that carry the whole-body transform offset,
// so the editor can position an avatar onto its chair, not just rotate its joints.
export const BODY_POS_KEY = "__posOffset"; // metres, added to the grounded position
export const BODY_ROT_KEY = "__rotOffset"; // radians, added to the base rotation

// Hand-authored seated poses (joint rotations in radians + a whole-body offset), tuned
// per model in the Pose Editor and baked in here so they ship by default. A pose saved
// to localStorage for the same model URL overrides these (see resolvePose).
export const DEFAULT_SEATED_POSES: Record<string, PoseMap> = {
  "/avatars/avatarsdk.glb": {
    __posOffset: [-0.05, 0.08, -0.16],
    // Sit upright and relaxed (was leaning forward / braced).
    Hips: [0.1, 0.0698, 0],
    Spine: [0.0524, -0.0873, 0],
    Spine2: [0.1047, 0.0698, 0],
    // Upper arms stay procedural (swung forward off the torso); forearms are bent so the
    // elbows fold and the hands rest on the thighs instead of hanging stiff/straight.
    // Symmetric (the previous hand-tuned right arm twisted).
    LeftForeArm: [0.4887, -0.6283, 0.4014],
    RightForeArm: [0.4887, 0.6283, -0.4014],
    // Legs symmetrised (left thigh previously splayed wider than the right). Knees point
    // forward with a small natural spread; shins drop straight to the floor.
    LeftUpLeg: [1.63, 3.05, 0.18],
    LeftLeg: [-1.57, 0, 0],
    RightUpLeg: [1.63, 3.05, -0.18],
    RightLeg: [-1.57, 0, 0],
  },
  "/avatars/brunette.glb": {
    __posOffset: [0, 0.08, -0.2],
    Hips: [-0.0698, 0, 0],
    Spine: [-0.1222, 0, 0],
    LeftForeArm: [0.4887, -0.6283, 0.4014],
    RightForeArm: [0.2793, -0.1222, -0.4887],
    RightHand: [0.0873, 0.6632, 0.192],
    LeftUpLeg: [1.7104, 3.1416, 0.05],
    LeftLeg: [-1.6581, -0.192, 0],
    LeftFoot: [1.0123, 0.5236, -0.2094],
    RightUpLeg: [1.6581, 3.1416, 0.2793],
    RightLeg: [-1.5708, 0, 0],
    RightFoot: [0.7505, 0.6807, -0.1396],
  },
};

// The effective pose for a model: baked default with any locally saved pose layered on
// top (the editor writes per-bone, so a saved value wins for that bone only).
export function resolvePose(url: string): PoseMap {
  return { ...(DEFAULT_SEATED_POSES[url] ?? {}), ...(loadSavedPose(url) ?? {}) };
}

export function resolveBody(
  url: string,
): { pos: [number, number, number]; rot: [number, number, number] } | null {
  const pose = resolvePose(url);
  const pos = pose[BODY_POS_KEY];
  const rot = pose[BODY_ROT_KEY];
  if (!pos && !rot) {
    return null;
  }
  return { pos: pos ?? [0, 0, 0], rot: rot ?? [0, 0, 0] };
}

export function loadSavedPose(url: string): PoseMap | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PREFIX + url);
    return raw ? (JSON.parse(raw) as PoseMap) : null;
  } catch {
    return null;
  }
}

export function saveSavedPose(url: string, pose: PoseMap) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PREFIX + url, JSON.stringify(pose));
  } catch {
    // ignore quota / serialization errors — the editor still works in-memory
  }
}

export function clearSavedPose(url: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(PREFIX + url);
  } catch {
    // ignore
  }
}

export function applyPoseMap(root: Object3D, pose: PoseMap) {
  root.traverse((object) => {
    // Skip reserved (non-bone) keys like the body transform offset.
    if (object.name.startsWith("__")) {
      return;
    }
    const rot = pose[object.name];
    if (rot) {
      object.rotation.set(rot[0], rot[1], rot[2]);
    }
  });
}

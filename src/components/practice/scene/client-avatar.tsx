"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Box3, Quaternion, Vector3, type Bone, type Mesh, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { AvatarPlaybackHandle } from "@/components/practice/client-presence-panel";
import { VisemePlayer } from "./viseme-player";
import { SeatedIdle } from "./seated-idle";
import { GazeController } from "./gaze-controller";
import { applyPoseMap, resolveBody, resolvePose } from "./seated-pose-store";

type Vec3 = [number, number, number];
type Pose = Record<string, Vec3>;

// Arms-at-sides pose. Absolute bone rotations (radians) from TalkingHead's 'side'
// template, which targets this exact RPM/Mixamo skeleton. (Verified on both avatars.)
const ARMS_DOWN: Pose = {
  LeftShoulder: [1.599, 0.084, -1.77],
  LeftArm: [1.364, 0.052, -0.044],
  LeftForeArm: [0.002, -0.007, 0.331],
  LeftHand: [0.104, -0.067, -0.174],
  LeftHandThumb1: [0.231, 0.258, 0.355],
  LeftHandThumb2: [-0.106, -0.339, -0.454],
  LeftHandIndex1: [0.148, 0.032, -0.069],
  LeftHandIndex2: [0.326, -0.049, -0.029],
  LeftHandMiddle1: [0.238, -0.057, -0.089],
  LeftHandMiddle2: [0.469, -0.036, -0.081],
  LeftHandRing1: [0.187, -0.118, -0.157],
  LeftHandRing2: [0.579, 0.02, -0.097],
  LeftHandPinky1: [0.405, -0.182, -0.138],
  LeftHandPinky2: [0.613, 0.128, -0.144],
  RightShoulder: [1.541, 0.192, 1.775],
  RightArm: [1.273, -0.352, -0.067],
  RightForeArm: [-0.011, -0.031, -0.357],
  RightHand: [-0.008, 0.312, -0.028],
  RightHandThumb1: [0.23, -0.258, -0.355],
  RightHandThumb2: [-0.107, 0.339, 0.454],
  RightHandIndex1: [0.148, -0.031, 0.069],
  RightHandIndex2: [0.326, 0.049, 0.029],
  RightHandMiddle1: [0.237, 0.057, 0.089],
  RightHandMiddle2: [0.469, 0.036, 0.081],
  RightHandRing1: [0.204, 0.086, 0.135],
  RightHandRing2: [0.579, -0.02, 0.098],
  RightHandPinky1: [0.404, 0.182, 0.137],
  RightHandPinky2: [0.613, -0.128, 0.144],
};

// Seated leg fold. TalkingHead's leg values assume a normalised rig, so we derive
// our own values for this GLB's bind orientation (tuned visually). Hip flexes the
// thigh forward; knee bends the shin down so feet rest on the floor.
const HIP_FLEX = 1.5; // thighs forward (knees toward the front of the chair)
const KNEE_BEND = 1.5; // shins drop down toward the floor
const SEATED_EXTRAS: Pose = {
  Spine: [0.06, 0, 0],
  LeftUpLeg: [HIP_FLEX, 0, 0.05],
  LeftLeg: [KNEE_BEND, 0, 0],
  RightUpLeg: [HIP_FLEX, 0, -0.05],
  RightLeg: [KNEE_BEND, 0, 0],
};

// Seated arms. Starting from the arms-at-sides pose (which clips the torso when
// seated), we swing the whole arm FORWARD into the lap with world-space rotations.
// World-space is used deliberately: each rig's local bone axes differ, but a world
// rotation behaves identically on both avatars, so the arms always land in the lap
// (clear of the torso and the chair's armrests).
const SHOULDER_FWD = 0.6; // swing upper arms forward/down off the torso (rad, world X)
const ELBOW_FOLD = 0.25; // gently drop the forearms down onto the lap (rad, world X)
const X_AXIS = new Vector3(1, 0, 0);

const STANDING_POSE: Pose = ARMS_DOWN;
const SEATED_POSE: Pose = { ...ARMS_DOWN, ...SEATED_EXTRAS };

// World height (metres) the pelvis should rest at when seated, so the body sits on
// the chair cushion rather than sinking into / floating above it. ~chair seat + pelvis.
const SEAT_HIP_Y = 0.47;

function applyPose(root: Object3D, pose: Pose) {
  root.traverse((object) => {
    const bone = object as Bone;
    const rot = pose[bone.name];
    if (rot) {
      bone.rotation.set(rot[0], rot[1], rot[2]);
    }
  });
}

// Rotate a bone about a WORLD axis, compensating for the parent's world rotation so
// the result is the same on any rig (unlike local-axis Euler tweaks).
const _parentQuat = new Quaternion();
const _deltaQuat = new Quaternion();
function rotateWorld(bone: Object3D, axis: Vector3, angle: number) {
  const parent = bone.parent;
  if (!parent) return;
  parent.getWorldQuaternion(_parentQuat);
  _deltaQuat.setFromAxisAngle(axis, angle);
  // localNew = parentQuatInv * delta * parentQuat * localOld
  bone.quaternion.premultiply(_parentQuat);
  bone.quaternion.premultiply(_deltaQuat);
  bone.quaternion.premultiply(_parentQuat.clone().invert());
}

// Swing both arms forward into the lap. Process upper arms first, refresh the world
// matrices, then the forearms (their world orientation depends on the upper arm).
function applySeatedArms(root: Object3D) {
  const bones: Record<string, Object3D> = {};
  root.traverse((object) => {
    bones[object.name] = object;
  });

  root.updateMatrixWorld(true);
  if (bones.LeftArm) rotateWorld(bones.LeftArm, X_AXIS, -SHOULDER_FWD);
  if (bones.RightArm) rotateWorld(bones.RightArm, X_AXIS, -SHOULDER_FWD);

  root.updateMatrixWorld(true);
  // Positive world-X folds the hands down toward the lap (negative would raise them
  // into a "presenting" gesture).
  if (bones.LeftForeArm) rotateWorld(bones.LeftForeArm, X_AXIS, ELBOW_FOLD);
  if (bones.RightForeArm) rotateWorld(bones.RightForeArm, X_AXIS, ELBOW_FOLD);
}

type ClientAvatarProps = {
  url: string;
  panelKey: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  seated?: boolean;
  onReady: (key: string, handle: AvatarPlaybackHandle | null) => void;
  onBones?: (key: string, bones: Record<string, Object3D> | null) => void;
};

export function ClientAvatar({
  url,
  panelKey,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  seated = false,
  onReady,
  onBones,
}: ClientAvatarProps) {
  const { scene } = useGLTF(url);
  // Clone so the same source GLB could be reused and so we own the morph arrays.
  // Also measure the posed body so its lowest point rests on the floor — this keeps
  // avatars of different heights seated consistently (taller bodies sit higher).
  const { root, groundOffset } = useMemo(() => {
    const cloned = cloneSkeleton(scene);
    applyPose(cloned, seated ? SEATED_POSE : STANDING_POSE);
    if (seated) {
      applySeatedArms(cloned);
      // The baked per-model seated pose (plus any Pose Editor override saved locally)
      // takes precedence over the procedural defaults for whichever bones it specifies.
      applyPoseMap(cloned, resolvePose(url));
    }
    cloned.updateMatrixWorld(true);

    if (seated) {
      // Anchor the pelvis to the seat so bodies of different heights sit on the
      // cushion (not submerged in / floating above it).
      let hipsY: number | null = null;
      const tmp = new Vector3();
      cloned.traverse((object) => {
        if (object.name === "Hips") {
          hipsY = object.getWorldPosition(tmp).y;
        }
      });
      if (hipsY !== null) {
        return { root: cloned, groundOffset: SEAT_HIP_Y - hipsY };
      }
    }

    // Standing: rest the lowest point (feet) on the floor.
    const box = new Box3().setFromObject(cloned);
    return { root: cloned, groundOffset: -box.min.y };
  }, [scene, seated, url]);
  const playerRef = useRef<VisemePlayer | null>(null);
  const idleRef = useRef<SeatedIdle | null>(null);
  const gazeRef = useRef<GazeController | null>(null);

  // Expose this avatar's bones to the (dev-only) Pose Editor.
  useEffect(() => {
    if (!onBones) {
      return;
    }
    const bones: Record<string, Object3D> = { __root: root };
    root.traverse((object) => {
      if ((object as Bone).isBone) {
        bones[object.name] = object;
      }
    });
    onBones(panelKey, bones);
    return () => onBones(panelKey, null);
  }, [root, onBones, panelKey]);

  useEffect(() => {
    const meshes: { dictionary: Record<string, number>; influences: number[] }[] = [];
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        mesh.frustumCulled = false;
        meshes.push({
          dictionary: mesh.morphTargetDictionary,
          influences: mesh.morphTargetInfluences,
        });
      }
    });

    const player = new VisemePlayer(meshes);
    playerRef.current = player;
    // Pre-load the lip-sync engine (e.g. Rhubarb WASM) now, while the avatar
    // mounts, so the first spoken reply isn't delayed. No-op for the rule engine.
    player.warmup();

    // Eye contact + micro-saccades + distress-driven gaze aversion (uses eye
    // bones, or ARKit eyeLook* morphs as a fallback).
    gazeRef.current = new GazeController(root, meshes);

    const handle: AvatarPlaybackHandle = {
      isReady: () => true,
      speak: (blob, text, mood, wordTimings) => player.speak(blob, text, mood, wordTimings),
      stop: () => player.stop(),
    };
    onReady(panelKey, handle);

    return () => {
      onReady(panelKey, null);
      player.dispose();
      playerRef.current = null;
      gazeRef.current?.dispose();
      gazeRef.current = null;
    };
  }, [root, onReady, panelKey]);

  // A subtle looping seated idle (breathing + micro head/weight shift), layered on top
  // of the baked pose. Captured after posing so it oscillates around the seated rest.
  useEffect(() => {
    if (!seated) {
      return;
    }
    const idle = new SeatedIdle(root, panelKey);
    idleRef.current = idle;
    return () => {
      idle.dispose();
      idleRef.current = null;
    };
  }, [root, seated, panelKey]);

  useFrame((_, delta) => {
    const player = playerRef.current;
    player?.update();
    idleRef.current?.update();
    gazeRef.current?.update(delta, player?.getMood() ?? "neutral");
  });

  // Whole-body transform offset (baked default + any Pose Editor override) that positions
  // the avatar on its chair. Read every render so a Save shows up without remounting.
  const savedBody = seated ? resolveBody(url) : null;
  const grounded: [number, number, number] = [
    position[0] + (savedBody?.pos[0] ?? 0),
    position[1] + groundOffset + (savedBody?.pos[1] ?? 0),
    position[2] + (savedBody?.pos[2] ?? 0),
  ];
  const bodyRotation: [number, number, number] = [
    rotation[0] + (savedBody?.rot[0] ?? 0),
    rotation[1] + (savedBody?.rot[1] ?? 0),
    rotation[2] + (savedBody?.rot[2] ?? 0),
  ];

  return <primitive object={root} position={grounded} rotation={bodyRotation} />;
}

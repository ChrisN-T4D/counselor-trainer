"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import { Suspense, useCallback, useMemo, useState } from "react";
import type { Object3D } from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { AvatarPlaybackHandle } from "@/components/practice/client-presence-panel";
import { ClientAvatar } from "./client-avatar";
import { PoseEditor } from "./pose-editor";
import { Room, RoomDecor, WALL_COLOR } from "./room-decor";

const POSE_EDITOR_ENABLED = process.env.NODE_ENV !== "production";

export type SceneParticipant = {
  key: string;
  name: string;
  avatarUrl: string;
};

type TherapySceneProps = {
  participants: SceneParticipant[];
  onReady: (key: string, handle: AvatarPlaybackHandle | null) => void;
  playingSpeaker?: string | null;
};

// Layout knobs (metres). Tweak these to reframe the room.
// Couple: a chest-up two-shot — close enough to read faces, wide enough for both clients.
const CAMERA_POSITION: [number, number, number] = [0, 1.34, 1.95];
const CAMERA_TARGET: [number, number, number] = [0, 1.24, 0];
const CAMERA_FOV = 32;
// Single client: a tighter, more intimate chest-up of one centred client.
const CAMERA_POSITION_SINGLE: [number, number, number] = [0, 1.28, 1.45];
const CAMERA_TARGET_SINGLE: [number, number, number] = [0, 1.16, 0];
const CAMERA_FOV_SINGLE = 30;
const SEAT_SPREAD = 0.52; // horizontal gap from centre for two seats
const SEAT_Z = 0; // chairs sit on the origin line, clients face +Z (the therapist)
const AVATAR_FWD = 0.14; // seat the body toward the front of the cushion (off the chair back)
const AVATAR_SEAT_Y = 0; // ClientAvatar grounds its own feet; chair sets seat height
const CHAIR_URL = "/scene/armchair/ArmChair_01_1k.gltf";

function seatXs(count: number): number[] {
  if (count <= 1) {
    return [0];
  }
  return [-SEAT_SPREAD, SEAT_SPREAD];
}

function Chair({ x }: { x: number }) {
  const { scene } = useGLTF(CHAIR_URL);
  const model = useMemo<Object3D>(() => cloneSkeleton(scene), [scene]);
  return <primitive object={model} position={[x, 0, SEAT_Z]} rotation={[0, 0, 0]} />;
}

function LoadingOverlay() {
  const { active } = useProgress();
  if (!active) {
    return null;
  }
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/60">
      <p className="text-sm text-slate-200">Entering the room…</p>
    </div>
  );
}

export default function TherapyScene({ participants, onReady, playingSpeaker }: TherapySceneProps) {
  const single = participants.length <= 1;
  const xs = seatXs(participants.length);
  const cameraPosition = single ? CAMERA_POSITION_SINGLE : CAMERA_POSITION;
  const cameraTarget = single ? CAMERA_TARGET_SINGLE : CAMERA_TARGET;
  const cameraFov = single ? CAMERA_FOV_SINGLE : CAMERA_FOV;
  const [bonesByKey, setBonesByKey] = useState<Record<string, Record<string, Object3D>>>({});

  const handleBones = useCallback((key: string, bones: Record<string, Object3D> | null) => {
    setBonesByKey((prev) => {
      if (!bones) {
        if (!(key in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: bones };
    });
  }, []);

  const poseEditorAvatars = useMemo(
    () => participants.map((p) => ({ key: p.key, name: p.name, url: p.avatarUrl })),
    [participants],
  );

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: cameraPosition, fov: cameraFov }}
      >
        <color attach="background" args={[WALL_COLOR]} />
        <Suspense fallback={null}>
          {/* HDRI kept for image-based lighting only (no `background`), so the room is the
              real geometry below and parallaxes/scales correctly with the camera. */}
          <Environment files="/scene/env_room4.hdr" />
          <ambientLight intensity={0.5} />
          <directionalLight position={[2.5, 4, 3]} intensity={1.3} castShadow />
          <Room />
          <RoomDecor single={single} />
          {xs.map((x, index) => (
            <Chair key={`chair-${index}`} x={x} />
          ))}
          {participants.map((participant, index) => (
            <ClientAvatar
              key={participant.key}
              panelKey={participant.key}
              url={participant.avatarUrl}
              seated
              position={[xs[index] ?? 0, AVATAR_SEAT_Y, SEAT_Z + AVATAR_FWD]}
              onReady={onReady}
              onBones={POSE_EDITOR_ENABLED ? handleBones : undefined}
            />
          ))}
          <ContactShadows
            position={[0, 0.01, 0]}
            opacity={0.5}
            blur={2.6}
            scale={6}
            far={4}
          />
        </Suspense>
        <OrbitControls
          target={cameraTarget}
          enablePan
          screenSpacePanning
          enableDamping
          minDistance={1.2}
          maxDistance={4}
          minPolarAngle={0.4}
          maxPolarAngle={1.7}
        />
      </Canvas>

      <LoadingOverlay />

      {POSE_EDITOR_ENABLED && (
        <PoseEditor avatars={poseEditorAvatars} bonesByKey={bonesByKey} />
      )}

      {participants.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-6 p-3">
          {participants.map((participant) => (
            <span
              key={participant.key}
              className={`rounded px-2 py-0.5 text-xs backdrop-blur-sm ${
                playingSpeaker === participant.key
                  ? "bg-emerald-500/80 text-white"
                  : "bg-slate-900/55 text-slate-200"
              }`}
            >
              {participant.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

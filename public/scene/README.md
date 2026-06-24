# Practice scene assets

Assets for the two practice "presence" views:

- **Avatar view** — a 2D photo backdrop rendered behind the (transparent) TalkingHead
  avatars so multi-client sessions look like they share a room.
- **Room (3D) view** — a real React Three Fiber scene where both client avatars stand in
  an HDRI-lit room. This is the foundation for the eventual WebXR / VR experience.

| File | Source | License | Used by |
|------|--------|---------|---------|
| `therapy-room.jpg` | [Unsplash](https://unsplash.com/photos/photo-1520605728164-b6a5c6814203) | [Unsplash License](https://unsplash.com/license) (free, commercial, no attribution) | Avatar view backdrop |
| `env_room4.hdr` | [Poly Haven – Small Empty Room 4](https://polyhaven.com/a/small_empty_room_4) (2k) | [CC0](https://polyhaven.com/license) | Room (3D) **lighting only** (image-based lighting). The visible room is real geometry (see `Room` in `therapy-scene.tsx`), so it parallaxes/scales with the camera; an HDRI `background` sits at infinity and reads as a flat backdrop. |
| `armchair/ArmChair_01_1k.gltf` (+ textures) | [Poly Haven – ArmChair 01](https://polyhaven.com/a/ArmChair_01) (1k) | [CC0](https://polyhaven.com/license) | Room (3D) — one per seated client |
| `sofa/Sofa_01_1k.gltf` (+ textures) | [Poly Haven – Sofa 01](https://polyhaven.com/a/Sofa_01) (1k) | [CC0](https://polyhaven.com/license) | Spare furniture (shared-couch layout) |

All assets are self-hosted because the runtime environment blocks external asset hosts.

## The Room (3D) view

Implemented in `src/components/practice/scene/`:

- `therapy-scene.tsx` — the `<Canvas>`, HDRI `Environment`, lights, contact shadows,
  orbit controls, and avatar placement. Layout knobs (camera, spacing) are constants at
  the top of the file.
- `client-avatar.tsx` — loads each client's GLB, poses it (standing arms-down, or a
  seated fold for the chairs), grounds its lowest point to the floor so differently
  sized avatars sit consistently, and exposes the same `AvatarPlaybackHandle` the rest of
  the app already drives. Pose/seat knobs (`HIP_FLEX`, `KNEE_BEND`) are constants near
  the top.
- `viseme-player.ts` — renders Oculus visemes from TTS audio. Reuses TalkingHead's
  English word→viseme rules (`LipsyncEn`) with ElevenLabs word timings, but applies the
  morph influences itself so multiple avatars can share one scene.
- `seated-idle.ts` — a subtle, looping seated idle (breathing + micro head/weight shift)
  applied procedurally on top of the baked pose. We avoid loading an external animation
  clip: no free CC0 seated clip exists on this exact RPM/Mixamo skeleton, and cross-rig
  retargeting of foreign clips is fragile. The idle only nudges torso/neck/head bones, so
  it can never break the rig and never fights lip-sync (which drives morph targets).
- `seated-pose-store.ts` — per-model baked seated poses (`DEFAULT_SEATED_POSES`) plus the
  Pose Editor's localStorage overrides.

Because the scene reuses the existing `AvatarController` / `AvatarPlaybackHandle`
pipeline, per-speaker voice, sequencing, and interruption all work unchanged.

## Toward VR (next phases)

The 3D scene is deliberately self-contained so Phase 2 can add `@react-three/xr`
(headset camera + "Enter VR" button) on top of the same `<Canvas>`. Phase 3 covers
seated poses (using the bundled sofa), idle motion, and eye contact.

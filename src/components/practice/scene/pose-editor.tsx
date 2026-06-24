"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Object3D } from "three";
import {
  BODY_POS_KEY,
  BODY_ROT_KEY,
  clearSavedPose,
  resolvePose,
  saveSavedPose,
  type PoseMap,
} from "./seated-pose-store";
import { setIdlePaused } from "./seated-idle";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// Special targets that move/rotate the whole avatar (not a single joint).
const BODY_MOVE = "__bodyMove";
const BODY_TURN = "__bodyTurn";

// Bones worth posing for a seated figure, in head-to-toe order.
const EDITABLE_BONES = [
  "Hips",
  "Spine",
  "Spine1",
  "Spine2",
  "Neck",
  "Head",
  "LeftShoulder",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightShoulder",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftUpLeg",
  "LeftLeg",
  "LeftFoot",
  "RightUpLeg",
  "RightLeg",
  "RightFoot",
];

const AXES = ["x", "y", "z"] as const;
type Axis = (typeof AXES)[number];
type Triple = { x: number; y: number; z: number };

export type PoseEditorAvatar = {
  key: string;
  name: string;
  url: string;
};

type PoseEditorProps = {
  avatars: PoseEditorAvatar[];
  bonesByKey: Record<string, Record<string, Object3D>>;
};

function sliderConfig(target: string) {
  if (target === BODY_MOVE) {
    return { min: -0.8, max: 0.8, step: 0.01, unit: "m", decimals: 2 };
  }
  // BODY_TURN and bones are expressed in degrees.
  return { min: -180, max: 180, step: 1, unit: "°", decimals: 0 };
}

export function PoseEditor({ avatars, bonesByKey }: PoseEditorProps) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState("");
  const [target, setTarget] = useState<string>(BODY_MOVE);
  const [angles, setAngles] = useState<Triple>({ x: 0, y: 0, z: 0 });
  const [edits, setEdits] = useState<Record<string, PoseMap>>({});
  const [status, setStatus] = useState("");
  // Neutral (offset = 0) transform of each instance's root, captured lazily so body
  // moves can be applied absolutely (base + offset) instead of as fragile per-event deltas.
  const baseRef = useRef<Record<string, { p: [number, number, number]; r: [number, number, number] }>>({});

  const active = avatars.find((a) => a.key === activeKey) ?? avatars[0];
  const activeUrl = active?.url ?? "";
  const isBodyMove = target === BODY_MOVE;
  const isBodyTurn = target === BODY_TURN;
  const config = sliderConfig(target);

  useEffect(() => {
    if (!activeKey && avatars[0]) {
      setActiveKey(avatars[0].key);
    }
  }, [avatars, activeKey]);

  // While the editor is open, pause the procedural seated idle so it doesn't fight the
  // sliders by rewriting spine/neck/head every frame. (Reload to see a saved pose play
  // back with the idle layered on it.)
  useEffect(() => {
    setIdlePaused(open);
    return () => setIdlePaused(false);
  }, [open]);

  // Seed the in-memory edit set from anything already saved for these models.
  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const avatar of avatars) {
        if (!next[avatar.url]) {
          next[avatar.url] = resolvePose(avatar.url);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [avatars]);

  const availableBones = useMemo(() => {
    const bones = active ? bonesByKey[active.key] : undefined;
    if (!bones) {
      return EDITABLE_BONES;
    }
    return EDITABLE_BONES.filter((name) => bones[name]);
  }, [active, bonesByKey]);

  // Read the current value of the selected target into the sliders.
  const syncTarget = useCallback(() => {
    if (!active) {
      return;
    }
    if (isBodyMove) {
      const off = edits[active.url]?.[BODY_POS_KEY] ?? [0, 0, 0];
      setAngles({ x: off[0], y: off[1], z: off[2] });
      return;
    }
    if (isBodyTurn) {
      const off = edits[active.url]?.[BODY_ROT_KEY] ?? [0, 0, 0];
      setAngles({ x: off[0] * DEG, y: off[1] * DEG, z: off[2] * DEG });
      return;
    }
    const bone = bonesByKey[active.key]?.[target];
    if (bone) {
      setAngles({
        x: bone.rotation.x * DEG,
        y: bone.rotation.y * DEG,
        z: bone.rotation.z * DEG,
      });
    }
  }, [active, bonesByKey, target, isBodyMove, isBodyTurn, edits]);

  useEffect(() => {
    syncTarget();
    // Only re-sync when the target or avatar changes (not on every edit write).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, activeKey]);

  const instancesForActive = useCallback(
    () => avatars.filter((a) => a.url === activeUrl),
    [avatars, activeUrl],
  );

  const recordEdit = useCallback(
    (key: string, value: [number, number, number]) => {
      setEdits((prev) => ({
        ...prev,
        [activeUrl]: { ...(prev[activeUrl] ?? {}), [key]: value },
      }));
    },
    [activeUrl],
  );

  // Lazily capture an instance's neutral transform (root transform minus whatever
  // offset is currently applied), so we can always position it absolutely.
  const baseFor = useCallback(
    (avatarKey: string) => {
      const cached = baseRef.current[avatarKey];
      if (cached) {
        return cached;
      }
      const root = bonesByKey[avatarKey]?.__root;
      const posOff = edits[activeUrl]?.[BODY_POS_KEY] ?? [0, 0, 0];
      const rotOff = edits[activeUrl]?.[BODY_ROT_KEY] ?? [0, 0, 0];
      const base = {
        p: [
          (root?.position.x ?? 0) - posOff[0],
          (root?.position.y ?? 0) - posOff[1],
          (root?.position.z ?? 0) - posOff[2],
        ] as [number, number, number],
        r: [
          (root?.rotation.x ?? 0) - rotOff[0],
          (root?.rotation.y ?? 0) - rotOff[1],
          (root?.rotation.z ?? 0) - rotOff[2],
        ] as [number, number, number],
      };
      baseRef.current[avatarKey] = base;
      return base;
    },
    [bonesByKey, edits, activeUrl],
  );

  const onSlider = (axis: Axis, value: number) => {
    if (!active) {
      return;
    }
    const next = { ...angles, [axis]: value };
    setAngles(next);
    const index = axis === "x" ? 0 : axis === "y" ? 1 : 2;

    if (isBodyMove) {
      for (const avatar of instancesForActive()) {
        const root = bonesByKey[avatar.key]?.__root;
        if (root) {
          root.position[axis] = baseFor(avatar.key).p[index] + value;
        }
      }
      recordEdit(BODY_POS_KEY, [next.x, next.y, next.z]);
      return;
    }

    if (isBodyTurn) {
      for (const avatar of instancesForActive()) {
        const root = bonesByKey[avatar.key]?.__root;
        if (root) {
          root.rotation[axis] = baseFor(avatar.key).r[index] + value * RAD;
        }
      }
      recordEdit(BODY_ROT_KEY, [next.x * RAD, next.y * RAD, next.z * RAD]);
      return;
    }

    // A bone: set its absolute local rotation.
    const rad: [number, number, number] = [next.x * RAD, next.y * RAD, next.z * RAD];
    for (const avatar of instancesForActive()) {
      bonesByKey[avatar.key]?.[target]?.rotation.set(rad[0], rad[1], rad[2]);
    }
    recordEdit(target, rad);
  };

  const onSave = () => {
    if (!active) {
      return;
    }
    const pose = edits[active.url] ?? {};
    saveSavedPose(active.url, pose);
    setStatus(`Saved pose for ${active.name}`);
  };

  const onCopy = async () => {
    if (!active) {
      return;
    }
    const json = JSON.stringify(edits[active.url] ?? {}, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setStatus("Pose JSON copied to clipboard");
    } catch {
      // eslint-disable-next-line no-console
      console.log(`Pose for ${active.url}:\n${json}`);
      setStatus("Clipboard blocked — logged JSON to console");
    }
  };

  const onResetAll = () => {
    if (!active) {
      return;
    }
    clearSavedPose(active.url);
    setEdits((prev) => ({ ...prev, [active.url]: {} }));
    setStatus(`Cleared saved pose for ${active.name} — reload to restore defaults`);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute right-2 top-2 z-20 rounded bg-slate-900/70 px-2 py-1 text-xs font-medium text-slate-100 hover:bg-slate-900"
      >
        Pose editor
      </button>
    );
  }

  const fmt = (value: number) => value.toFixed(config.decimals);

  return (
    <div className="absolute right-2 top-2 z-20 w-64 rounded-lg border border-slate-700 bg-slate-900/90 p-3 text-xs text-slate-100 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Pose editor</span>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
          ✕
        </button>
      </div>

      <label className="mb-1 block text-slate-400">Avatar</label>
      <div className="mb-2 flex flex-wrap gap-1">
        {avatars.map((avatar) => (
          <button
            key={avatar.key}
            type="button"
            onClick={() => setActiveKey(avatar.key)}
            className={`rounded px-2 py-1 ${
              active?.key === avatar.key ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"
            }`}
          >
            {avatar.name}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-slate-400">Target</label>
      <select
        value={target}
        onChange={(event) => setTarget(event.target.value)}
        className="mb-3 w-full rounded bg-slate-800 px-2 py-1 text-slate-100"
      >
        <optgroup label="Whole body">
          <option value={BODY_MOVE}>Body · move (m)</option>
          <option value={BODY_TURN}>Body · rotate</option>
        </optgroup>
        <optgroup label="Joints">
          {availableBones.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      </select>

      {AXES.map((axis) => (
        <div key={axis} className="mb-2">
          <div className="flex justify-between text-slate-400">
            <span>
              {axis.toUpperCase()}
              {isBodyMove && axis === "y" ? " (up)" : ""}
              {isBodyMove && axis === "z" ? " (toward you)" : ""}
            </span>
            <span>
              {fmt(angles[axis])}
              {config.unit}
            </span>
          </div>
          <input
            type="range"
            min={config.min}
            max={config.max}
            step={config.step}
            value={angles[axis]}
            onChange={(event) => onSlider(axis, Number(event.target.value))}
            className="w-full"
          />
        </div>
      ))}

      <div className="mt-3 grid grid-cols-2 gap-1">
        <button type="button" onClick={onSave} className="rounded bg-emerald-600 px-2 py-1 font-medium hover:bg-emerald-500">
          Save
        </button>
        <button type="button" onClick={onCopy} className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600">
          Copy JSON
        </button>
        <button type="button" onClick={onResetAll} className="col-span-2 rounded bg-red-900/80 px-2 py-1 hover:bg-red-800">
          Clear all (reload to restore)
        </button>
      </div>

      {status && <p className="mt-2 text-[11px] text-emerald-300">{status}</p>}
      <p className="mt-2 text-[10px] leading-tight text-slate-500">
        Use <b>Body · move</b> to slide the avatar onto the chair, <b>Body · rotate</b> to turn them, then the joints to
        fine-tune. Save persists per model in this browser; Copy JSON to bake into code.
      </p>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  TalkingHeadBridge,
  type TalkingHeadBridgeState,
} from "@/components/practice/talking-head-bridge";
import type { AvatarCatalogEntry } from "@/lib/visual/avatar-catalog";
import type { AvatarMood } from "@/lib/visual/types";
import type { WordTimings } from "@/lib/visual/word-timings";
import type { EmotionVector } from "@/lib/affect/emotion";
import { dominantAxis } from "@/lib/affect/emotion";
import type { ReactionCue } from "@/lib/affect/emotion-state";

export type AvatarPlaybackHandle = {
  isReady: () => boolean;
  speak: (blob: Blob, text: string, mood: AvatarMood, wordTimings?: WordTimings) => Promise<void>;
  stop: () => void;
  /**
   * Drive sustained affect from a displayed Ekman vector + arousal + rapport.
   * Optional: the rich 3D path implements it; the TalkingHead bridge degrades to
   * a coarse mood.
   */
  setAffect?: (vector: EmotionVector, arousal: number, rapport: number) => void;
  /** Fire a transient nonverbal reaction. Optional (rich path only). */
  triggerReaction?: (cue: ReactionCue) => void;
};

/** Coarse fallback: pick the avatar mood that best matches a displayed affect vector. */
export function moodFromAffectVector(vector: EmotionVector): AvatarMood {
  const { axis, value } = dominantAxis(vector);
  if (value < 0.2) return "neutral";
  switch (axis) {
    case "anger":
    case "contempt":
      return "angry";
    case "disgust":
      return "disgust";
    case "fear":
    case "surprise":
      return "fear";
    case "sadness":
      return "sad";
    case "enjoyment":
      return "happy";
    default:
      return "neutral";
  }
}

/** Routes playback to the right avatar by speaker key (couples/family), or the sole avatar. */
export type AvatarController = {
  getHandle: (speaker: string | null) => AvatarPlaybackHandle | null;
  stopAll: () => void;
};

type ClientPresencePanelProps = {
  avatarEntry: AvatarCatalogEntry | null;
  presenceLabel: string;
  onReady: (key: string, handle: AvatarPlaybackHandle | null) => void;
  panelKey?: string;
  title?: string;
  active?: boolean;
  /** When true, drop the panel's own border/background so it can share a container with others. */
  embedded?: boolean;
};

function ClientPresencePanelInner({
  avatarEntry,
  presenceLabel,
  onReady,
  panelKey = "client",
  title = "Client",
  active = false,
  embedded = false,
}: ClientPresencePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<TalkingHeadBridge | null>(null);
  const [panelState, setPanelState] = useState<TalkingHeadBridgeState>("idle");
  const [panelError, setPanelError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = new TalkingHeadBridge();
    bridgeRef.current = bridge;

    bridge.setOnStateChange((state, error) => {
      setPanelState(state);
      setPanelError(error ?? null);
    });

    const handle: AvatarPlaybackHandle = {
      isReady: () => bridge.isReady(),
      speak: (blob, text, mood, wordTimings) =>
        bridge.speakFromBlob(blob, text, mood, wordTimings),
      stop: () => bridge.stop(),
      // TalkingHead has no blendshape vector control here, so degrade affect to a
      // coarse sustained mood and drop transient reactions.
      setAffect: (vector) => bridge.setMood(moodFromAffectVector(vector)),
    };

    onReady(panelKey, handle);

    return () => {
      onReady(panelKey, null);
      bridge.destroy();
      bridgeRef.current = null;
    };
  }, [onReady, panelKey]);

  useEffect(() => {
    const container = containerRef.current;
    const bridge = bridgeRef.current;
    if (!container || !bridge || !avatarEntry) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await bridge.init(container);
        if (!cancelled) {
          await bridge.loadAvatar(avatarEntry);
        }
      } catch {
        // Error state is surfaced via bridge callback.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [avatarEntry]);

  return (
    <div
      className={`relative transition-colors ${
        embedded
          ? `h-full ${active ? "ring-2 ring-inset ring-emerald-400" : ""}`
          : `overflow-hidden rounded-lg border bg-slate-900/95 ${
              active ? "border-emerald-400 ring-1 ring-emerald-400/60" : "border-slate-200"
            }`
      }`}
    >
      <div
        className={
          embedded
            ? "absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2"
            : "flex items-center justify-between border-b border-white/10 px-3 py-2"
        }
      >
        <p
          className={
            embedded
              ? "rounded bg-slate-900/55 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-white backdrop-blur-sm"
              : "text-xs font-medium uppercase tracking-wide text-slate-300"
          }
        >
          {title}
        </p>
        <p
          className={
            embedded
              ? `rounded px-2 py-0.5 text-xs backdrop-blur-sm ${
                  active ? "bg-emerald-500/80 text-white" : "bg-slate-900/55 text-slate-200"
                }`
              : "text-xs text-slate-400"
          }
          aria-live="polite"
        >
          {presenceLabel}
        </p>
      </div>
      <div
        className={`relative aspect-[4/3] w-full ${
          embedded ? "" : "bg-gradient-to-b from-slate-800 to-slate-950"
        }`}
      >
        <div ref={containerRef} className="absolute inset-0" />
        {(panelState === "loading" || panelState === "idle") && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
            <p className="text-sm text-slate-300">Loading client avatar…</p>
          </div>
        )}
        {panelState === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 p-6 text-center">
            <div className="max-w-sm space-y-2">
              <p className="text-sm font-medium text-white">Avatar model not available</p>
              <p className="text-xs leading-relaxed text-slate-300">
                {panelError ??
                  "Add a TalkingHead-compatible GLB to public/avatars/ or switch to Text view."}
              </p>
              <p className="text-xs text-slate-400">
                Export from VRoid Studio, convert with the TalkingHead Blender guide, then name files
                to match the avatar catalog keys.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const ClientPresencePanel = dynamic(
  () => Promise.resolve({ default: ClientPresencePanelInner }),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
        Preparing avatar view…
      </div>
    ),
  },
);

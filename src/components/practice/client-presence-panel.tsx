"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  TalkingHeadBridge,
  type TalkingHeadBridgeState,
} from "@/components/practice/talking-head-bridge";
import type { AvatarCatalogEntry } from "@/lib/visual/avatar-catalog";
import type { AvatarMood } from "@/lib/visual/types";

export type AvatarPlaybackHandle = {
  isReady: () => boolean;
  speak: (blob: Blob, text: string, mood: AvatarMood) => Promise<void>;
  stop: () => void;
};

type ClientPresencePanelProps = {
  avatarEntry: AvatarCatalogEntry | null;
  presenceLabel: string;
  onReady: (handle: AvatarPlaybackHandle | null) => void;
};

function ClientPresencePanelInner({ avatarEntry, presenceLabel, onReady }: ClientPresencePanelProps) {
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
      speak: (blob, text, mood) => bridge.speakFromBlob(blob, text, mood),
      stop: () => bridge.stop(),
    };

    onReady(handle);

    return () => {
      onReady(null);
      bridge.destroy();
      bridgeRef.current = null;
    };
  }, [onReady]);

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
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900/95">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Client</p>
        <p className="text-xs text-slate-400" aria-live="polite">
          {presenceLabel}
        </p>
      </div>
      <div className="relative aspect-[4/3] w-full bg-gradient-to-b from-slate-800 to-slate-950">
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

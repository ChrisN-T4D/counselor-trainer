"use client";

import type { AvatarCatalogEntry } from "@/lib/visual/avatar-catalog";
import type { AvatarMood } from "@/lib/visual/types";
import { estimateWordTimings } from "@/lib/visual/word-timings";

type TalkingHeadInstance = {
  showAvatar: (avatar: Record<string, unknown>, onprogress?: ((url: string, event: ProgressEvent) => void) | null) => Promise<void>;
  speakAudio: (
    audio: Record<string, unknown>,
    opt?: Record<string, unknown>,
    onsubtitles?: ((node: HTMLElement) => void) | null,
  ) => void;
  stopSpeaking: () => void;
  setMood: (mood: string) => void;
  dispose: () => void;
  isSpeaking?: boolean;
  isAudioPlaying?: boolean;
};

type TalkingHeadConstructor = new (
  node: HTMLElement,
  opt?: Record<string, unknown>,
) => TalkingHeadInstance;

export type TalkingHeadBridgeState = "idle" | "loading" | "ready" | "speaking" | "error";

export class TalkingHeadBridge {
  private container: HTMLElement | null = null;
  private head: TalkingHeadInstance | null = null;
  private state: TalkingHeadBridgeState = "idle";
  private loadError: string | null = null;
  private onStateChange: ((state: TalkingHeadBridgeState, error?: string | null) => void) | null = null;
  private speakDoneTimer: number | null = null;

  setOnStateChange(handler: (state: TalkingHeadBridgeState, error?: string | null) => void) {
    this.onStateChange = handler;
  }

  getState() {
    return this.state;
  }

  getError() {
    return this.loadError;
  }

  isReady() {
    return this.state === "ready" || this.state === "speaking";
  }

  private setState(next: TalkingHeadBridgeState, error: string | null = null) {
    this.state = next;
    this.loadError = error;
    this.onStateChange?.(next, error);
  }

  async init(container: HTMLElement) {
    if (this.head && this.container === container) {
      return;
    }

    this.container = container;
    this.setState("loading");

    const { TalkingHead } = (await import("@met4citizen/talkinghead/modules/talkinghead.mjs")) as {
      TalkingHead: TalkingHeadConstructor;
    };

    container.replaceChildren();
    const mount = document.createElement("div");
    mount.className = "h-full w-full";
    container.appendChild(mount);

    this.head?.dispose();

    this.head = new TalkingHead(mount, {
      lipsyncLang: "en",
      lipsyncModules: ["en"],
      cameraView: "upper",
      cameraRotateEnable: false,
      cameraPanEnable: false,
      cameraZoomEnable: false,
      avatarMood: "neutral",
      modelPixelRatio: Math.min(window.devicePixelRatio, 2),
    });
  }

  async loadAvatar(entry: AvatarCatalogEntry) {
    if (!this.head) {
      throw new Error("TalkingHead is not initialized");
    }

    this.setState("loading");

    try {
      await this.head.showAvatar({
        url: entry.modelUrl,
        body: entry.body,
        lipsyncLang: "en",
        avatarMood: entry.defaultMood,
      });

      this.setState("ready");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not load avatar model. Add a TalkingHead-compatible GLB to public/avatars/.";
      this.setState("error", message);
      throw error;
    }
  }

  private clearSpeakTimer() {
    if (this.speakDoneTimer !== null) {
      window.clearTimeout(this.speakDoneTimer);
      this.speakDoneTimer = null;
    }
  }

  private waitForSpeechEnd(durationMs: number) {
    this.clearSpeakTimer();
    return new Promise<void>((resolve) => {
      this.speakDoneTimer = window.setTimeout(() => {
        this.speakDoneTimer = null;
        if (this.state === "speaking") {
          this.setState("ready");
        }
        resolve();
      }, durationMs + 150);
    });
  }

  async speakFromBlob(blob: Blob, text: string, mood: AvatarMood) {
    if (!this.head) {
      throw new Error("TalkingHead is not initialized");
    }

    this.clearSpeakTimer();
    this.head.stopSpeaking();
    this.head.setMood(mood);
    this.setState("speaking");

    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const durationMs = audioBuffer.duration * 1000;
      const { words, wtimes, wdurations } = estimateWordTimings(text, durationMs);

      this.head.speakAudio(
        {
          audio: audioBuffer,
          words,
          wtimes,
          wdurations,
        },
        { lipsyncLang: "en", isRaw: true },
      );

      await this.waitForSpeechEnd(durationMs);
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  }

  stop() {
    this.clearSpeakTimer();
    this.head?.stopSpeaking();
    if (this.state === "speaking") {
      this.setState("ready");
    }
  }

  destroy() {
    this.clearSpeakTimer();
    this.head?.dispose();
    this.head = null;
    this.container = null;
    this.setState("idle");
  }
}

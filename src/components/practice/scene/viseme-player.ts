"use client";

import { LipsyncEn } from "@met4citizen/talkinghead/modules/lipsync-en.mjs";
import { estimateWordTimings, type WordTimings } from "@/lib/visual/word-timings";
import type { AvatarMood } from "@/lib/visual/types";

/** Oculus viseme blend-shape names present on RPM / AvatarSDK avatars. */
const VISEME_NAMES = [
  "viseme_sil",
  "viseme_PP",
  "viseme_FF",
  "viseme_TH",
  "viseme_DD",
  "viseme_kk",
  "viseme_CH",
  "viseme_SS",
  "viseme_nn",
  "viseme_RR",
  "viseme_aa",
  "viseme_E",
  "viseme_I",
  "viseme_O",
  "viseme_U",
] as const;

const BLINK_NAMES = ["eyeBlinkLeft", "eyeBlinkRight"] as const;

type MorphMesh = {
  dictionary: Record<string, number>;
  influences: number[];
};

type MorphTarget = { influences: number[]; index: number };

type VisemeSegment = { targets: MorphTarget[]; start: number; end: number };

type LipsyncResult = { visemes: string[]; times: number[]; durations: number[] };

/**
 * Drives Oculus-viseme mouth shapes on one avatar's meshes from TTS audio.
 *
 * Reuses TalkingHead's English word->viseme rules (LipsyncEn.wordsToVisemes) but
 * renders the morph influences ourselves so multiple avatars can share one 3D scene.
 * Timings come from ElevenLabs character alignment (WordTimings) when available.
 */
export class VisemePlayer {
  private readonly meshes: MorphMesh[];
  private readonly visemeTargets: Map<string, MorphTarget[]>;
  private readonly blinkTargets: MorphTarget[];
  private readonly lipsync = new LipsyncEn();

  private audioContext: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private segments: VisemeSegment[] = [];
  private startTime = 0;
  private durationMs = 0;
  private playing = false;
  private doneResolve: (() => void) | null = null;

  private nextBlinkAt = 1.5 + Math.random() * 3;
  private blinkClock = 0;
  private lastFrame = 0;

  constructor(meshes: MorphMesh[]) {
    this.meshes = meshes;
    this.visemeTargets = new Map();
    for (const name of VISEME_NAMES) {
      this.visemeTargets.set(name, this.collectTargets(name));
    }
    this.blinkTargets = BLINK_NAMES.flatMap((n) => this.collectTargets(n));
  }

  private collectTargets(morphName: string): MorphTarget[] {
    const out: MorphTarget[] = [];
    for (const mesh of this.meshes) {
      const index = mesh.dictionary[morphName];
      if (index !== undefined) {
        out.push({ influences: mesh.influences, index });
      }
    }
    return out;
  }

  private getContext(): AudioContext {
    if (!this.audioContext) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new Ctor();
    }
    return this.audioContext;
  }

  /** Build absolute-timed viseme segments from word timings (preferred) or an estimate. */
  private buildSegments(text: string, durationMs: number, wordTimings?: WordTimings) {
    const timings =
      wordTimings && wordTimings.words.length > 0
        ? wordTimings
        : estimateWordTimings(text, durationMs);

    const segments: VisemeSegment[] = [];
    for (let i = 0; i < timings.words.length; i += 1) {
      const word = timings.words[i].replace(/[^a-zA-Z']/g, "");
      if (!word) continue;

      const wordStart = timings.wtimes[i];
      const wordDur = timings.wdurations[i];
      const v = this.lipsync.wordsToVisemes(word) as LipsyncResult;
      if (!v.visemes.length) continue;

      const relTotal = v.times[v.times.length - 1] + v.durations[v.durations.length - 1];
      const scale = relTotal > 0 ? wordDur / relTotal : 0;

      for (let k = 0; k < v.visemes.length; k += 1) {
        const targets = this.visemeTargets.get(`viseme_${v.visemes[k]}`);
        if (!targets || targets.length === 0) continue;
        const start = wordStart + v.times[k] * scale;
        const end = start + Math.max(v.durations[k] * scale, 30);
        segments.push({ targets, start, end });
      }
    }
    return segments;
  }

  async speak(blob: Blob, text: string, _mood: AvatarMood, wordTimings?: WordTimings): Promise<void> {
    this.stop();
    const ctx = this.getContext();
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.durationMs = audioBuffer.duration * 1000;
    this.segments = this.buildSegments(text, this.durationMs, wordTimings);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    this.source = source;
    this.startTime = ctx.currentTime;
    this.playing = true;

    return new Promise<void>((resolve) => {
      this.doneResolve = resolve;
      source.onended = () => this.finish();
      source.start();
    });
  }

  private finish() {
    if (!this.playing && !this.doneResolve) return;
    this.playing = false;
    this.clearVisemes();
    if (this.source) {
      this.source.onended = null;
      this.source = null;
    }
    const resolve = this.doneResolve;
    this.doneResolve = null;
    resolve?.();
  }

  private clearVisemes() {
    for (const targets of this.visemeTargets.values()) {
      for (const t of targets) t.influences[t.index] = 0;
    }
  }

  /** Called every frame by the avatar component. */
  update() {
    const now = performance.now() / 1000;
    const dt = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;

    this.updateBlink(dt);

    if (!this.playing || !this.audioContext) return;

    const t = (this.audioContext.currentTime - this.startTime) * 1000;
    if (t >= this.durationMs + 120) {
      this.finish();
      return;
    }

    this.clearVisemes();
    for (const seg of this.segments) {
      if (t < seg.start || t > seg.end) continue;
      const local = (t - seg.start) / Math.max(seg.end - seg.start, 1);
      const env = Math.sin(local * Math.PI); // 0 -> 1 -> 0
      for (const target of seg.targets) {
        if (env > target.influences[target.index]) {
          target.influences[target.index] = env;
        }
      }
    }
  }

  private updateBlink(dt: number) {
    if (this.blinkTargets.length === 0) return;
    this.blinkClock += dt;
    let value = 0;
    const sinceBlink = this.blinkClock - this.nextBlinkAt;
    if (sinceBlink >= 0) {
      const blinkDur = 0.16;
      if (sinceBlink <= blinkDur) {
        value = Math.sin((sinceBlink / blinkDur) * Math.PI);
      } else {
        this.nextBlinkAt = this.blinkClock + 2 + Math.random() * 4;
      }
    }
    for (const t of this.blinkTargets) t.influences[t.index] = value;
  }

  stop() {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source = null;
    }
    this.playing = false;
    this.clearVisemes();
    const resolve = this.doneResolve;
    this.doneResolve = null;
    resolve?.();
  }

  dispose() {
    this.stop();
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
  }
}

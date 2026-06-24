"use client";

import type { WordTimings } from "@/lib/visual/word-timings";
import type { AvatarMood } from "@/lib/visual/types";
import { getFallbackEngine, getLipSyncEngine } from "@/lib/visual/lipsync/factory";
import { VISEME_NAMES, type LipSyncEngine, type VisemeTimeline } from "@/lib/visual/lipsync/types";
import type { EmotionVector } from "@/lib/affect/emotion";
import { ExpressionController } from "./expression-controller";

const BLINK_NAMES = ["eyeBlinkLeft", "eyeBlinkRight"] as const;
const JAW_NAME = "jawOpen";
const SIL_NAME = "viseme_sil";

// Coarticulation: half-width (ms) of the raised-cosine ramp blended into each
// segment's edges so adjacent mouth shapes crossfade instead of snapping.
const COARTICULATION_MS = 55;
// Max jaw opening driven by the audio envelope (0..1 morph influence).
const JAW_MAX = 0.7;
// Gain from RMS amplitude -> jaw influence before clamping.
const JAW_GAIN = 3.2;

type MorphMesh = {
  dictionary: Record<string, number>;
  influences: number[];
};

type MorphTarget = { influences: number[]; index: number };

/** A timeline segment with its viseme name resolved to this avatar's morph targets. */
type RenderSegment = { targets: MorphTarget[]; start: number; end: number };

/**
 * Drives Oculus-viseme mouth shapes on one avatar's meshes from TTS audio.
 *
 * The mouth-shape timeline comes from a swappable {@link LipSyncEngine}
 * (rule-based by default; Rhubarb WASM or NVIDIA Audio2Face-3D via
 * `NEXT_PUBLIC_LIPSYNC_ENGINE`). We render the morph influences ourselves so
 * multiple avatars can share one 3D scene.
 */
export class VisemePlayer {
  private readonly meshes: MorphMesh[];
  private readonly visemeTargets: Map<string, MorphTarget[]>;
  private readonly blinkTargets: MorphTarget[];
  private readonly jawTargets: MorphTarget[];
  private readonly silTargets: MorphTarget[];
  private readonly engine: LipSyncEngine = getLipSyncEngine();
  private readonly expression: ExpressionController;

  private audioContext: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private amplitudeBuffer: Float32Array<ArrayBuffer> | null = null;
  private segments: RenderSegment[] = [];
  private startTime = 0;
  private durationMs = 0;
  private playing = false;
  private doneResolve: (() => void) | null = null;

  private nextBlinkAt = 1.5 + Math.random() * 3;
  private blinkClock = 0;
  private lastFrame = 0;
  private mood: AvatarMood = "neutral";
  // When set (affect channel active), the displayed Ekman vector drives the face
  // and the coarse per-utterance `mood` no longer touches the expression.
  private affectVector: EmotionVector | null = null;
  private affectGain = 1;

  constructor(meshes: MorphMesh[]) {
    this.meshes = meshes;
    this.visemeTargets = new Map();
    for (const name of VISEME_NAMES) {
      this.visemeTargets.set(name, this.collectTargets(name));
    }
    this.blinkTargets = BLINK_NAMES.flatMap((n) => this.collectTargets(n));
    this.jawTargets = this.collectTargets(JAW_NAME);
    this.silTargets = this.visemeTargets.get(SIL_NAME) ?? [];
    this.expression = new ExpressionController(meshes);
    this.probeMorphs();
  }

  /**
   * Dev-only: log which expression/viseme/jaw morphs this avatar actually
   * exposes, so the mood map (expression-controller.ts) can be finalized against
   * real data. Findings are recorded in docs/roleplay-model-and-realism-notes.md.
   */
  private probeMorphs() {
    if (process.env.NODE_ENV === "production") return;
    const allKeys = new Set<string>();
    for (const mesh of this.meshes) {
      for (const key of Object.keys(mesh.dictionary)) allKeys.add(key);
    }
    const visemes = VISEME_NAMES.filter((n) => (this.visemeTargets.get(n)?.length ?? 0) > 0);
    console.info("[avatar morphs] probe", {
      total: allKeys.size,
      visemes,
      hasJawOpen: this.jawTargets.length > 0,
      expression: this.expression.presentMorphs(),
      all: Array.from(allKeys).sort(),
    });
  }

  /** Pre-initialize the engine (e.g. load WASM) so the first reply isn't delayed. */
  warmup() {
    this.engine.warmup?.();
  }

  /** The current emotional mood (neutral between utterances). Drives gaze aversion. */
  getMood(): AvatarMood {
    return this.mood;
  }

  /**
   * Drive the sustained facial expression from a displayed emotion vector. Pass
   * `null` to release control back to the coarse per-utterance mood. Once a vector
   * is set, it persists across utterances (the felt emotion outlives one reply).
   */
  setAffectVector(vector: EmotionVector | null, gain = 1) {
    this.affectVector = vector;
    this.affectGain = gain;
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

  /** Resolve an engine timeline's viseme names to this avatar's morph targets. */
  private resolveTimeline(timeline: VisemeTimeline): RenderSegment[] {
    const segments: RenderSegment[] = [];
    for (const seg of timeline.segments) {
      const targets = this.visemeTargets.get(seg.viseme);
      if (!targets || targets.length === 0) continue;
      segments.push({ targets, start: seg.start, end: seg.end });
    }
    return segments;
  }

  async speak(blob: Blob, text: string, mood: AvatarMood, wordTimings?: WordTimings): Promise<void> {
    this.stop();
    const ctx = this.getContext();
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }

    this.mood = mood;
    if (!this.affectVector) this.expression.setMood(mood);

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.durationMs = audioBuffer.duration * 1000;

    const timeline = await this.generateTimeline(audioBuffer, text, wordTimings);
    this.segments = this.resolveTimeline(timeline);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Tap the audio for a jaw-follows-loudness envelope (defensive: only used if
    // the avatar has a jawOpen morph). The analyser is a side branch; it does not
    // need to reach the destination to read samples.
    if (this.jawTargets.length > 0) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      this.analyser = analyser;
      this.amplitudeBuffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    }

    this.source = source;
    this.startTime = ctx.currentTime;
    this.playing = true;

    return new Promise<void>((resolve) => {
      this.doneResolve = resolve;
      source.onended = () => this.finish();
      source.start();
    });
  }

  /** Ask the active engine for a timeline; fall back to the rule engine on failure. */
  private async generateTimeline(
    audioBuffer: AudioBuffer,
    text: string,
    wordTimings?: WordTimings,
  ): Promise<VisemeTimeline> {
    const input = { audioBuffer, text, durationMs: this.durationMs, wordTimings };
    try {
      return await this.engine.generate(input);
    } catch (err) {
      if (this.engine.id !== "rule") {
        console.warn(`[lipsync] ${this.engine.id} engine failed; using rule fallback`, err);
        try {
          return await getFallbackEngine().generate(input);
        } catch (fallbackErr) {
          console.warn("[lipsync] rule fallback also failed", fallbackErr);
        }
      }
      return { durationMs: this.durationMs, segments: [] };
    }
  }

  private finish() {
    if (!this.playing && !this.doneResolve) return;
    this.playing = false;
    this.mood = "neutral";
    this.clearVisemes();
    this.setJaw(0);
    if (!this.affectVector) this.expression.setMood("neutral");
    this.analyser = null;
    this.amplitudeBuffer = null;
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

  private setJaw(value: number) {
    for (const t of this.jawTargets) t.influences[t.index] = value;
  }

  /** Read the current RMS loudness (0..1) from the analyser tap. */
  private readAmplitude(): number {
    if (!this.analyser || !this.amplitudeBuffer) return 0;
    this.analyser.getFloatTimeDomainData(this.amplitudeBuffer);
    let sum = 0;
    for (let i = 0; i < this.amplitudeBuffer.length; i += 1) {
      const s = this.amplitudeBuffer[i];
      sum += s * s;
    }
    return Math.sqrt(sum / this.amplitudeBuffer.length);
  }

  /** Raised-cosine envelope with coarticulation ramps blended into both edges. */
  private coarticulatedEnvelope(t: number, start: number, end: number): number {
    const ramp = Math.min(COARTICULATION_MS, Math.max(1, (end - start) / 2));
    if (t <= start - ramp || t >= end + ramp) return 0;
    if (t < start + ramp) {
      return 0.5 - 0.5 * Math.cos((Math.PI * (t - (start - ramp))) / (2 * ramp));
    }
    if (t > end - ramp) {
      return 0.5 - 0.5 * Math.cos((Math.PI * (end + ramp - t)) / (2 * ramp));
    }
    return 1;
  }

  /** Called every frame by the avatar component. */
  update() {
    const now = performance.now() / 1000;
    const dt = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;

    this.updateBlink(dt);
    if (this.affectVector) {
      // Arousal lightly boosts overall expressiveness; gain carries it in.
      this.expression.setAffectVector(this.affectVector, this.affectGain);
    }
    this.expression.update(dt);

    if (!this.playing || !this.audioContext) {
      this.setJaw(0);
      return;
    }

    const t = (this.audioContext.currentTime - this.startTime) * 1000;
    if (t >= this.durationMs + 120) {
      this.finish();
      return;
    }

    this.clearVisemes();
    let maxEnv = 0;
    for (const seg of this.segments) {
      const env = this.coarticulatedEnvelope(t, seg.start, seg.end);
      if (env <= 0) continue;
      if (env > maxEnv) maxEnv = env;
      for (const target of seg.targets) {
        if (env > target.influences[target.index]) {
          target.influences[target.index] = env;
        }
      }
    }

    // Jaw opening tracks loudness, layered under the viseme shapes.
    const jaw = Math.min(JAW_MAX, this.readAmplitude() * JAW_GAIN);
    this.setJaw(jaw);

    // On silence (little mouth shape + quiet audio), assert the closed rest mouth.
    const activity = Math.max(maxEnv, jaw);
    if (this.silTargets.length > 0) {
      const sil = Math.max(0, 0.5 - activity);
      for (const target of this.silTargets) {
        if (sil > target.influences[target.index]) target.influences[target.index] = sil;
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
    this.mood = "neutral";
    this.clearVisemes();
    this.setJaw(0);
    if (!this.affectVector) this.expression.setMood("neutral");
    this.analyser = null;
    this.amplitudeBuffer = null;
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

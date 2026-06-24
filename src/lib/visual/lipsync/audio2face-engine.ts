"use client";

import { audioBufferToPcm16Mono } from "./audio";
import {
  type LipSyncEngine,
  type LipSyncInput,
  type VisemeTimeline,
} from "./types";

/**
 * NVIDIA Audio2Face-3D lip-sync engine — **scaffold / not yet implemented**.
 *
 * A2F-3D needs a GPU, so this can't run on the current box while the LLM owns
 * the 3060. The seam exists today so it's a config swap (`NEXT_PUBLIC_LIPSYNC_ENGINE=audio2face`)
 * once a GPU is free (A2F NIM on RunPod, a dedicated GPU, or NVIDIA's hosted API).
 *
 * Flow when implemented:
 *   1. Decode TTS audio -> 16 kHz mono PCM16 (here, client-side).
 *   2. POST the PCM to `/api/lipsync` (server-side; see src/app/api/lipsync/route.ts).
 *   3. That route streams the PCM to the A2F-3D NIM over gRPC
 *      (`ProcessAudioStream`, 16 kHz/16-bit/mono in -> ARKit blendshape frames
 *      at ~30 fps out), maps ARKit -> Oculus visemes, and returns a normalized
 *      {@link VisemeTimeline}.
 *
 * Until the backend is configured the route returns 501; `generate()` throws and
 * `VisemePlayer` transparently falls back to the rule engine.
 */
const SAMPLE_RATE = 16000;
const LIPSYNC_API = "/api/lipsync";

export class Audio2FaceEngine implements LipSyncEngine {
  readonly id = "audio2face" as const;

  // Server-side warmup (model load) isn't something the client can trigger;
  // intentionally a no-op so the pre-warm call on mount is harmless.
  warmup() {}

  async generate(input: LipSyncInput): Promise<VisemeTimeline> {
    const pcm16 = await audioBufferToPcm16Mono(input.audioBuffer, SAMPLE_RATE);

    const res = await fetch(LIPSYNC_API, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-sample-rate": String(SAMPLE_RATE),
        "x-duration-ms": String(Math.round(input.durationMs)),
        "x-dialog-text": encodeURIComponent(input.text ?? ""),
      },
      body: pcm16.buffer as ArrayBuffer,
    });

    if (!res.ok) {
      throw new Error(`audio2face: /api/lipsync responded ${res.status}`);
    }

    // The route is the single source of truth for the timeline shape; it returns
    // a VisemeTimeline already normalized to Oculus viseme names.
    const timeline = (await res.json()) as VisemeTimeline;
    if (!timeline || !Array.isArray(timeline.segments)) {
      throw new Error("audio2face: malformed timeline from /api/lipsync");
    }
    return { durationMs: timeline.durationMs ?? input.durationMs, segments: timeline.segments };
  }
}

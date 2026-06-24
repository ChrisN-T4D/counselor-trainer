import { NextResponse } from "next/server";

/**
 * NVIDIA Audio2Face-3D lip-sync seam — **scaffold / not yet implemented**.
 *
 * Receives 16 kHz mono PCM16 audio (raw octet-stream body) from the client
 * `Audio2FaceEngine` and is intended to:
 *   1. Open a gRPC stream to the Audio2Face-3D NIM (`ProcessAudioStream`).
 *   2. Send the PCM (16 kHz / 16-bit / mono) and receive ARKit blendshape frames
 *      (~30 fps).
 *   3. Convert those frames to a normalized `VisemeTimeline` (ARKit -> Oculus via
 *      `ARKIT_TO_OCULUS` in src/lib/visual/lipsync/arkit-visemes.ts, or drive
 *      ARKit morphs directly on ARKit-capable avatars) and return it as JSON.
 *
 * Gated by env: `LIPSYNC_ENGINE=audio2face` + `A2F_ENDPOINT` (the NIM gRPC
 * target, e.g. a RunPod GPU pod or NVIDIA's hosted endpoint). Until both are set
 * this returns 501 and the client falls back to the rule engine.
 *
 * gRPC plumbing (e.g. `@grpc/grpc-js` + the A2F proto) is intentionally NOT wired
 * yet — it needs a GPU to talk to. Implement when the 3060 is freed (brain on
 * RunPod) or against NVIDIA's hosted API.
 */
export const runtime = "nodejs";

function isConfigured(): boolean {
  return process.env.LIPSYNC_ENGINE === "audio2face" && Boolean(process.env.A2F_ENDPOINT);
}

export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return NextResponse.json(
      {
        error: "audio2face_not_configured",
        message:
          "Audio2Face-3D is not wired yet. Set LIPSYNC_ENGINE=audio2face and " +
          "A2F_ENDPOINT (NIM gRPC target) and implement the gRPC stream in " +
          "src/app/api/lipsync/route.ts. The client falls back to the rule engine.",
      },
      { status: 501 },
    );
  }

  // --- Future implementation sketch (needs a GPU + the A2F NIM proto) ---------
  // const sampleRate = Number(request.headers.get("x-sample-rate") ?? 16000);
  // const durationMs = Number(request.headers.get("x-duration-ms") ?? 0);
  // const dialogText = decodeURIComponent(request.headers.get("x-dialog-text") ?? "");
  // const pcm = new Int16Array(await request.arrayBuffer());
  // const frames = await streamToAudio2Face(pcm, sampleRate, dialogText, process.env.A2F_ENDPOINT!);
  // const segments = arkitFramesToVisemeSegments(frames, ARKIT_TO_OCULUS); // ~30fps -> segments
  // return NextResponse.json({ durationMs, segments } satisfies VisemeTimeline);
  void request;
  return NextResponse.json(
    { error: "not_implemented", message: "A2F gRPC stream not yet implemented." },
    { status: 501 },
  );
}

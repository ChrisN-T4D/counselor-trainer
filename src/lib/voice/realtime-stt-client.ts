"use client";

// Client-side ElevenLabs realtime STT (scribe_v2_realtime). Phase 2: this only
// feeds mid-utterance client *reactions* — the batch /api/stt path remains the
// authoritative final transcript, so this is fully additive and reversible.
//
// Security: the browser never sees the API key. It fetches a short-lived
// single-use token from /api/stt/realtime-token and connects directly to
// ElevenLabs (vendor-recommended pattern; no custom WS server needed).

const TARGET_SAMPLE_RATE = 16000;

type RealtimeSttOptions = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
};

type TokenResponse = { token: string; modelId: string; baseUri: string };

/** Downsample a Float32 mono buffer to 16 kHz and encode as little-endian PCM16. */
function floatToPcm16Base64(input: Float32Array, inputRate: number): string {
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outLength = Math.floor(input.length / ratio);
  const pcm = new DataView(new ArrayBuffer(outLength * 2));
  for (let i = 0; i < outLength; i += 1) {
    const sample = input[Math.floor(i * ratio)] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  // Base64-encode the bytes.
  let binary = "";
  const bytes = new Uint8Array(pcm.buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export class RealtimeSttSession {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private closed = false;

  constructor(private readonly options: RealtimeSttOptions = {}) {}

  /** Mint a token, open the WS, and start streaming mic PCM from `stream`. */
  async start(stream: MediaStream): Promise<void> {
    const tokenRes = await fetch("/api/stt/realtime-token", { method: "POST" });
    if (!tokenRes.ok) {
      const data = (await tokenRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not start realtime STT");
    }
    const { token, modelId, baseUri } = (await tokenRes.json()) as TokenResponse;
    if (this.closed) return;

    const url = `${baseUri}/v1/speech-to-text/realtime?model_id=${encodeURIComponent(
      modelId,
    )}&commit_strategy=vad&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onmessage = (event) => this.handleMessage(event.data);
    ws.onerror = () => this.options.onError?.("Realtime STT connection error");

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.addEventListener("error", () => reject(new Error("Realtime STT failed to connect")), {
        once: true,
      });
    });
    if (this.closed) {
      ws.close();
      return;
    }

    this.startStreaming(stream);
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string") return;
    let msg: { message_type?: string; text?: string; error?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.message_type) {
      case "partial_transcript":
        if (msg.text) this.options.onPartial?.(msg.text);
        break;
      case "committed_transcript":
      case "committed_transcript_with_timestamps":
        if (msg.text) this.options.onFinal?.(msg.text);
        break;
      case "error":
        if (msg.error) this.options.onError?.(msg.error);
        break;
      default:
        break;
    }
  }

  private startStreaming(stream: MediaStream) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.audioContext = ctx;
    const source = ctx.createMediaStreamSource(stream);
    this.source = source;
    // ScriptProcessor is deprecated but ubiquitous and simple; ~4096-frame blocks
    // at the device rate, downsampled to 16 kHz before sending.
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    this.processor = processor;

    processor.onaudioprocess = (event) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const channel = event.inputBuffer.getChannelData(0);
      const audioBase64 = floatToPcm16Base64(channel, ctx.sampleRate);
      this.ws.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: audioBase64,
          commit: false,
          sample_rate: TARGET_SAMPLE_RATE,
        }),
      );
    };

    source.connect(processor);
    // Route through a muted gain node so onaudioprocess fires without echo.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    processor.connect(sink);
    sink.connect(ctx.destination);
  }

  stop() {
    this.closed = true;
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.source?.disconnect();
    this.source = null;
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}

import { elevenLabsStt } from "./elevenlabs-stt";
import { elevenLabsTts } from "./elevenlabs-tts";
import { noopStt, noopTts } from "./noop";
import type { SttProvider } from "./stt-provider";
import type { TtsProvider } from "./tts-provider";

export function createTtsProvider(): TtsProvider {
  const provider = process.env.TTS_PROVIDER ?? "noop";

  switch (provider) {
    case "noop":
      return noopTts;
    case "elevenlabs":
      return elevenLabsTts;
    case "azure":
      throw new Error("Azure Speech TTS is planned for production migration");
    default:
      throw new Error(`Unknown TTS_PROVIDER: ${provider}`);
  }
}

export function createSttProvider(): SttProvider {
  const provider = process.env.STT_PROVIDER ?? "noop";

  switch (provider) {
    case "noop":
      return noopStt;
    case "elevenlabs":
      return elevenLabsStt;
    case "azure":
      throw new Error("Azure Speech STT is planned for production migration");
    case "browser":
      return noopStt;
    default:
      throw new Error(`Unknown STT_PROVIDER: ${provider}`);
  }
}

export type RealtimeSttConfig = {
  enabled: boolean;
  provider: "elevenlabs" | "none";
  modelId: string;
};

/**
 * Realtime STT is an additive Phase-2 layer used only to feed mid-utterance
 * client reactions; the batch {@link createSttProvider} stays the authoritative
 * final transcript. Gated by `STT_REALTIME` (defaults off).
 */
export function getRealtimeSttConfig(): RealtimeSttConfig {
  const provider = process.env.STT_REALTIME?.trim().toLowerCase();
  if (provider === "elevenlabs") {
    return {
      enabled: true,
      provider: "elevenlabs",
      modelId: process.env.ELEVENLABS_STT_REALTIME_MODEL_ID?.trim() || "scribe_v2_realtime",
    };
  }
  return { enabled: false, provider: "none", modelId: "" };
}

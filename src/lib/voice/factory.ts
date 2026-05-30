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

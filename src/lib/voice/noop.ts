import type { SttProvider } from "./stt-provider";
import type { TtsProvider } from "./tts-provider";

export const noopTts: TtsProvider = {
  async synthesize() {
    return new ArrayBuffer(0);
  },
};

export const noopStt: SttProvider = {
  async transcribe() {
    return "";
  },
};

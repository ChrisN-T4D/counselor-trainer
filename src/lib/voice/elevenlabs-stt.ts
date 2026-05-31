import {
  ELEVENLABS_API_BASE,
  elevenLabsHeaders,
  getElevenLabsApiKey,
  getElevenLabsSttModelId,
} from "./elevenlabs-config";
import { readElevenLabsError } from "./elevenlabs-errors";
import type { SttProvider } from "./stt-provider";

export const elevenLabsStt: SttProvider = {
  async transcribe(audio, opts) {
    const apiKey = getElevenLabsApiKey();
    const modelId = getElevenLabsSttModelId();

    const formData = new FormData();
    formData.append("model_id", modelId);
    formData.append("file", audio, "audio.webm");
    if (opts?.language) {
      formData.append("language_code", opts.language);
    }

    const response = await fetch(`${ELEVENLABS_API_BASE}/speech-to-text`, {
      method: "POST",
      headers: elevenLabsHeaders(apiKey),
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await readElevenLabsError(response, "STT"));
    }

    const body = (await response.json()) as {
      text?: string;
      transcripts?: Array<{ text?: string }>;
    };

    const text = body.text?.trim() || body.transcripts?.[0]?.text?.trim() || "";
    if (!text) {
      throw new Error("ElevenLabs STT returned an empty transcript");
    }

    return text;
  },
};

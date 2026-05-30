import {
  ELEVENLABS_API_BASE,
  elevenLabsHeaders,
  getElevenLabsApiKey,
  getElevenLabsVoiceId,
  resolveElevenLabsTtsModelId,
} from "./elevenlabs-config";
import {
  hasDeliveryTags,
  normalizeDeliveryTagsForTts,
  voiceSettingsForDelivery,
} from "./delivery-tags";
import type { TtsProvider } from "./tts-provider";

async function readElevenLabsError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
    return JSON.stringify(body.detail ?? body);
  } catch {
    return response.statusText || "ElevenLabs TTS request failed";
  }
}

export const elevenLabsTts: TtsProvider = {
  async synthesize(text, opts) {
    const apiKey = getElevenLabsApiKey();
    const voiceId = getElevenLabsVoiceId(opts?.voiceId);
    const tagged = hasDeliveryTags(text);
    const modelId = resolveElevenLabsTtsModelId(text, tagged);
    const ttsText = normalizeDeliveryTagsForTts(text);

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          ...elevenLabsHeaders(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: ttsText,
          model_id: modelId,
          voice_settings: voiceSettingsForDelivery(ttsText),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await readElevenLabsError(response));
    }

    return response.arrayBuffer();
  },
};

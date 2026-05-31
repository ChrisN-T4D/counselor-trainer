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
  stripDeliveryTagsForDisplay,
  usesElevenLabsExpressiveModel,
  voiceSettingsForDelivery,
} from "./delivery-tags";
import { readElevenLabsError } from "./elevenlabs-errors";
import type { TtsProvider } from "./tts-provider";

export const elevenLabsTts: TtsProvider = {
  async synthesize(text, opts) {
    const apiKey = getElevenLabsApiKey();
    const voiceId = getElevenLabsVoiceId(opts?.voiceId);
    const tagged = hasDeliveryTags(text);
    const modelId = resolveElevenLabsTtsModelId(text, tagged);
    const ttsText = usesElevenLabsExpressiveModel(modelId)
      ? normalizeDeliveryTagsForTts(text)
      : stripDeliveryTagsForDisplay(text);

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
      throw new Error(await readElevenLabsError(response, "TTS"));
    }

    return response.arrayBuffer();
  },
};

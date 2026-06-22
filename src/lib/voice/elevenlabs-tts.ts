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
import type { TtsProvider, TtsResult } from "./tts-provider";
import { wordTimingsFromAlignment } from "@/lib/visual/word-timings";

type ElevenLabsTimestampResponse = {
  audio_base64: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  } | null;
};

function resolveTtsText(text: string): { ttsText: string; modelId: string } {
  const tagged = hasDeliveryTags(text);
  const modelId = resolveElevenLabsTtsModelId(text, tagged);
  const ttsText = usesElevenLabsExpressiveModel(modelId)
    ? normalizeDeliveryTagsForTts(text)
    : stripDeliveryTagsForDisplay(text);
  return { ttsText, modelId };
}

export const elevenLabsTts: TtsProvider = {
  async synthesize(text, opts) {
    const apiKey = getElevenLabsApiKey();
    const voiceId = getElevenLabsVoiceId(opts?.voiceId);
    const { ttsText, modelId } = resolveTtsText(text);

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

  async synthesizeWithTimings(text, opts): Promise<TtsResult> {
    const apiKey = getElevenLabsApiKey();
    const voiceId = getElevenLabsVoiceId(opts?.voiceId);
    const { ttsText, modelId } = resolveTtsText(text);

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
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

    const data = (await response.json()) as ElevenLabsTimestampResponse;
    const buffer = Buffer.from(data.audio_base64, "base64");
    const audio = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;

    const wordTimings = data.alignment
      ? wordTimingsFromAlignment(
          data.alignment.characters,
          data.alignment.character_start_times_seconds,
          data.alignment.character_end_times_seconds,
        )
      : undefined;

    return { audio, wordTimings };
  },
};

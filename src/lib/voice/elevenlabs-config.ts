const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export function getElevenLabsApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }
  return apiKey;
}

export function getElevenLabsVoiceId(override?: string): string {
  const voiceId = override?.trim() || process.env.ELEVENLABS_VOICE_ID?.trim();
  if (!voiceId) {
    throw new Error(
      "No voice ID available. Assign clientVoiceId on the scenario or set ELEVENLABS_VOICE_ID as fallback.",
    );
  }
  return voiceId;
}

export function getElevenLabsTtsModelId(): string {
  return process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5";
}

/** Used when client text includes delivery tags (better emotion on Eleven v3). */
export function getElevenLabsExpressiveModelId(): string {
  return process.env.ELEVENLABS_EXPRESSIVE_MODEL_ID?.trim() || "eleven_v3";
}

export function resolveElevenLabsTtsModelId(text: string, hasTags: boolean): string {
  if (hasTags) {
    return getElevenLabsExpressiveModelId();
  }
  return getElevenLabsTtsModelId();
}

export function getElevenLabsSttModelId(): string {
  return process.env.ELEVENLABS_STT_MODEL_ID?.trim() || "scribe_v2_realtime";
}

export function elevenLabsHeaders(apiKey: string): HeadersInit {
  return {
    "xi-api-key": apiKey,
    Accept: "application/json",
  };
}

export { ELEVENLABS_API_BASE };

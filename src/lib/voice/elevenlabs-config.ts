import { isPremadeCatalogVoiceId, listPremadeCatalogVoices } from "./voice-catalog";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

const DEFAULT_PREMADE_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export function getElevenLabsApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }
  return apiKey;
}

/** Resolve a free-tier premade voice ID (Voice Library IDs fail on free API plans). */
export function getElevenLabsVoiceId(override?: string): string {
  const overrideId = override?.trim();
  if (overrideId && isPremadeCatalogVoiceId(overrideId)) {
    return overrideId;
  }

  const envId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (envId && isPremadeCatalogVoiceId(envId)) {
    return envId;
  }

  return listPremadeCatalogVoices()[0]?.id ?? DEFAULT_PREMADE_VOICE_ID;
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
  return process.env.ELEVENLABS_STT_MODEL_ID?.trim() || "scribe_v2";
}

export function elevenLabsHeaders(apiKey: string): HeadersInit {
  return {
    "xi-api-key": apiKey,
    Accept: "application/json",
  };
}

export { ELEVENLABS_API_BASE };

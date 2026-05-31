import {
  DEFAULT_FREE_TIER_VOICE_ID,
  isFreeTierPremadeVoiceId,
  listPremadeCatalogVoices,
} from "./voice-catalog";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

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
  if (overrideId && isFreeTierPremadeVoiceId(overrideId)) {
    return overrideId;
  }

  const envId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (envId && isFreeTierPremadeVoiceId(envId)) {
    return envId;
  }

  return listPremadeCatalogVoices()[0]?.id ?? DEFAULT_FREE_TIER_VOICE_ID;
}

export function getElevenLabsTtsModelId(): string {
  return process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5";
}

/** Used when client text includes delivery tags — requires eleven_v3 (paid plans). */
export function getElevenLabsExpressiveModelId(): string {
  return process.env.ELEVENLABS_EXPRESSIVE_MODEL_ID?.trim() || "eleven_v3";
}

export function resolveElevenLabsTtsModelId(_text: string, hasTags: boolean): string {
  const flag = process.env.ELEVENLABS_USE_EXPRESSIVE_MODEL?.trim().toLowerCase();
  const expressiveDisabled = flag === "0" || flag === "false" || flag === "no";

  if (hasTags && !expressiveDisabled) {
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

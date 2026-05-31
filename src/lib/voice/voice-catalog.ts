export type ClientGender = "female" | "male" | "neutral";

export type VoiceCatalogEntry = {
  id: string;
  label: string;
  ageGroups: Array<"child" | "adolescent" | "adult" | "older_adult">;
  genders: ClientGender[];
};

/** Rachel — default free-tier premade voice. */
export const DEFAULT_FREE_TIER_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/** Premade ElevenLabs voices — free-tier API safe (not Voice Library). */
const DEFAULT_VOICE_CATALOG: VoiceCatalogEntry[] = [
  {
    id: DEFAULT_FREE_TIER_VOICE_ID,
    label: "Rachel — calm adult female",
    ageGroups: ["adult"],
    genders: ["female"],
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    label: "Adam — adult male",
    ageGroups: ["adult"],
    genders: ["male"],
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    label: "Bella — younger female",
    ageGroups: ["child", "adolescent", "adult"],
    genders: ["female"],
  },
  {
    id: "TxGEqnHWrfWFTfGW9HjH",
    label: "Josh — younger male",
    ageGroups: ["adolescent", "adult"],
    genders: ["male"],
  },
  {
    id: "ThT5KcBeYPX3keUQqHPh",
    label: "Dorothy — older adult female",
    ageGroups: ["older_adult", "adult"],
    genders: ["female"],
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    label: "Daniel — older adult male",
    ageGroups: ["older_adult", "adult"],
    genders: ["male"],
  },
  {
    id: "XB0fDUnXU5powFXDhCwa",
    label: "Charlotte — neutral adult",
    ageGroups: ["child", "adolescent", "adult", "older_adult"],
    genders: ["neutral", "female", "male"],
  },
];

const FREE_TIER_VOICE_IDS = new Set(DEFAULT_VOICE_CATALOG.map((entry) => entry.id));

/** True only for built-in premade IDs — ignores custom ELEVENLABS_VOICE_CATALOG entries. */
export function isFreeTierPremadeVoiceId(voiceId: string): boolean {
  return FREE_TIER_VOICE_IDS.has(voiceId.trim());
}

function loadVoiceCatalog(): VoiceCatalogEntry[] {
  const raw = process.env.ELEVENLABS_VOICE_CATALOG?.trim();
  if (!raw) {
    return DEFAULT_VOICE_CATALOG;
  }

  try {
    const parsed = JSON.parse(raw) as VoiceCatalogEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_VOICE_CATALOG;
    }

    const filtered = parsed.filter((entry) => isFreeTierPremadeVoiceId(entry.id));
    return filtered.length > 0 ? filtered : DEFAULT_VOICE_CATALOG;
  } catch {
    return DEFAULT_VOICE_CATALOG;
  }
}

function pickVoice(
  catalog: VoiceCatalogEntry[],
  ageGroup: string,
  gender: ClientGender,
): VoiceCatalogEntry | undefined {
  const exact = catalog.find(
    (entry) =>
      entry.ageGroups.includes(ageGroup as VoiceCatalogEntry["ageGroups"][number]) &&
      entry.genders.includes(gender),
  );
  if (exact) {
    return exact;
  }

  const byAge = catalog.find((entry) =>
    entry.ageGroups.includes(ageGroup as VoiceCatalogEntry["ageGroups"][number]),
  );
  if (byAge) {
    return byAge;
  }

  return catalog.find((entry) => entry.genders.includes(gender)) ?? catalog[0];
}

export function selectClientVoiceId(input: {
  ageGroup: string;
  gender: ClientGender;
}): string {
  const envFallback = process.env.ELEVENLABS_VOICE_ID?.trim();
  const picked = pickVoice(loadVoiceCatalog(), input.ageGroup, input.gender);

  if (picked?.id && isFreeTierPremadeVoiceId(picked.id)) {
    return picked.id;
  }

  if (envFallback && isFreeTierPremadeVoiceId(envFallback)) {
    return envFallback;
  }

  return DEFAULT_FREE_TIER_VOICE_ID;
}

/** @deprecated Use isFreeTierPremadeVoiceId — kept for callers that expect the old name. */
export function isPremadeCatalogVoiceId(voiceId: string): boolean {
  return isFreeTierPremadeVoiceId(voiceId);
}

function clientGenderFromGenerationSettings(generationSettings: unknown): ClientGender {
  if (!generationSettings || typeof generationSettings !== "object") {
    return "neutral";
  }

  const gender = (generationSettings as { clientGender?: string }).clientGender;
  if (gender === "female" || gender === "male" || gender === "neutral") {
    return gender;
  }

  return "neutral";
}

/** Pick a free-tier premade voice for a scenario (generator + TTS fallback). */
export function resolveClientVoiceIdForScenario(input: {
  clientVoiceId?: string | null;
  ageGroup?: string | null;
  generationSettings?: unknown;
}): string {
  const stored = input.clientVoiceId?.trim();
  if (stored && isFreeTierPremadeVoiceId(stored)) {
    return stored;
  }

  return selectClientVoiceId({
    ageGroup: input.ageGroup?.trim() || "adult",
    gender: clientGenderFromGenerationSettings(input.generationSettings),
  });
}

export function listPremadeCatalogVoices(): VoiceCatalogEntry[] {
  return DEFAULT_VOICE_CATALOG;
}

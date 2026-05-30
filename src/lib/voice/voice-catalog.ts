export type ClientGender = "female" | "male" | "neutral";

export type VoiceCatalogEntry = {
  id: string;
  label: string;
  ageGroups: Array<"child" | "adolescent" | "adult" | "older_adult">;
  genders: ClientGender[];
};

/** Premade ElevenLabs voices — override with ELEVENLABS_VOICE_CATALOG JSON if needed. */
const DEFAULT_VOICE_CATALOG: VoiceCatalogEntry[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
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
    return parsed;
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
    (entry) => entry.ageGroups.includes(ageGroup as VoiceCatalogEntry["ageGroups"][number]) &&
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
  const fallback = process.env.ELEVENLABS_VOICE_ID?.trim();
  const picked = pickVoice(loadVoiceCatalog(), input.ageGroup, input.gender);
  return picked?.id ?? fallback ?? DEFAULT_VOICE_CATALOG[0].id;
}

import type { ClientGender } from "@/lib/voice/voice-catalog";

export type AvatarCatalogEntry = {
  key: string;
  label: string;
  modelUrl: string;
  body: "F" | "M";
  ageGroups: Array<"child" | "adolescent" | "adult" | "older_adult">;
  genders: ClientGender[];
  defaultMood: "neutral" | "sad" | "fear";
  cameraView: "upper" | "head";
};

/**
 * Self-hosted GLB models in public/avatars/ (works offline; no external host needed —
 * the network blocks readyplayer.me, so models are bundled rather than hotlinked).
 * - brunette.glb: TalkingHead-verified Ready Player Me avatar (female, free non-commercial).
 * - avatarsdk.glb: TalkingHead-verified AvatarSDK avatar (male), full ARKit + Oculus visemes.
 *   (Replaces mpfb.glb, whose MakeHuman base mesh read as female.)
 * To add more per-demographic models, drop TalkingHead-compatible GLBs into
 * public/avatars/ (see public/avatars/README.md) and point the entries below at them.
 */
const AVATAR_FEMALE = "/avatars/brunette.glb";
const AVATAR_MALE = "/avatars/avatarsdk.glb";

const DEFAULT_AVATAR_CATALOG: AvatarCatalogEntry[] = [
  {
    key: "adult-female-01",
    label: "Adult woman",
    modelUrl: AVATAR_FEMALE,
    body: "F",
    ageGroups: ["adult"],
    genders: ["female"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "adult-male-01",
    label: "Adult man",
    modelUrl: AVATAR_MALE,
    body: "M",
    ageGroups: ["adult"],
    genders: ["male"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "adolescent-female-01",
    label: "Adolescent",
    modelUrl: AVATAR_FEMALE,
    body: "F",
    ageGroups: ["adolescent", "child"],
    genders: ["female", "neutral"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "adolescent-male-01",
    label: "Adolescent",
    modelUrl: AVATAR_MALE,
    body: "M",
    ageGroups: ["adolescent", "child"],
    genders: ["male"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "older-adult-female-01",
    label: "Older adult woman",
    modelUrl: AVATAR_FEMALE,
    body: "F",
    ageGroups: ["older_adult", "adult"],
    genders: ["female"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "older-adult-male-01",
    label: "Older adult man",
    modelUrl: AVATAR_MALE,
    body: "M",
    ageGroups: ["older_adult", "adult"],
    genders: ["male"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "neutral-adult-01",
    label: "Adult",
    modelUrl: AVATAR_FEMALE,
    body: "F",
    ageGroups: ["child", "adolescent", "adult", "older_adult"],
    genders: ["neutral", "female", "male"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
];

/** TalkingHead-verified avatar used as a load fallback if a catalog model URL fails. */
export const FALLBACK_AVATAR_URL = AVATAR_FEMALE;

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

function pickAvatar(
  catalog: AvatarCatalogEntry[],
  ageGroup: string,
  gender: ClientGender,
): AvatarCatalogEntry | undefined {
  const exact = catalog.find(
    (entry) =>
      entry.ageGroups.includes(ageGroup as AvatarCatalogEntry["ageGroups"][number]) &&
      entry.genders.includes(gender),
  );
  if (exact) {
    return exact;
  }

  const byAge = catalog.find((entry) =>
    entry.ageGroups.includes(ageGroup as AvatarCatalogEntry["ageGroups"][number]),
  );
  if (byAge) {
    return byAge;
  }

  return catalog.find((entry) => entry.genders.includes(gender)) ?? catalog.at(-1);
}

export function selectClientAvatarKey(input: {
  ageGroup: string;
  gender: ClientGender;
}): string {
  return pickAvatar(DEFAULT_AVATAR_CATALOG, input.ageGroup, input.gender)?.key ?? "neutral-adult-01";
}

export function resolveClientAvatarKeyForScenario(input: {
  clientAvatarKey?: string | null;
  ageGroup?: string | null;
  generationSettings?: unknown;
}): string {
  const stored = input.clientAvatarKey?.trim();
  if (stored && DEFAULT_AVATAR_CATALOG.some((entry) => entry.key === stored)) {
    return stored;
  }

  return selectClientAvatarKey({
    ageGroup: input.ageGroup?.trim() || "adult",
    gender: clientGenderFromGenerationSettings(input.generationSettings),
  });
}

export function getAvatarCatalogEntry(key: string): AvatarCatalogEntry | undefined {
  return DEFAULT_AVATAR_CATALOG.find((entry) => entry.key === key);
}

export function listAvatarCatalog(): AvatarCatalogEntry[] {
  return DEFAULT_AVATAR_CATALOG;
}

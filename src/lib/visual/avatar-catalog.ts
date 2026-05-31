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

/** Self-hosted GLB paths — export VRoid models to public/avatars/ (see public/avatars/README.md). */
const DEFAULT_AVATAR_CATALOG: AvatarCatalogEntry[] = [
  {
    key: "adult-female-01",
    label: "Adult woman",
    modelUrl: "/avatars/adult-female-01.glb",
    body: "F",
    ageGroups: ["adult"],
    genders: ["female"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "adult-male-01",
    label: "Adult man",
    modelUrl: "/avatars/adult-male-01.glb",
    body: "M",
    ageGroups: ["adult"],
    genders: ["male"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "adolescent-female-01",
    label: "Adolescent",
    modelUrl: "/avatars/adolescent-female-01.glb",
    body: "F",
    ageGroups: ["adolescent", "child"],
    genders: ["female", "neutral"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "adolescent-male-01",
    label: "Adolescent",
    modelUrl: "/avatars/adolescent-male-01.glb",
    body: "M",
    ageGroups: ["adolescent", "child"],
    genders: ["male"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "older-adult-female-01",
    label: "Older adult woman",
    modelUrl: "/avatars/older-adult-female-01.glb",
    body: "F",
    ageGroups: ["older_adult", "adult"],
    genders: ["female"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "older-adult-male-01",
    label: "Older adult man",
    modelUrl: "/avatars/older-adult-male-01.glb",
    body: "M",
    ageGroups: ["older_adult", "adult"],
    genders: ["male"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
  {
    key: "neutral-adult-01",
    label: "Adult",
    modelUrl: "/avatars/neutral-adult-01.glb",
    body: "F",
    ageGroups: ["child", "adolescent", "adult", "older_adult"],
    genders: ["neutral", "female", "male"],
    defaultMood: "neutral",
    cameraView: "upper",
  },
];

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

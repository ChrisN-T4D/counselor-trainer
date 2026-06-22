import { z } from "zod";
import { resolveClientAvatarKeyForScenario } from "@/lib/visual/avatar-catalog";
import { resolveClientVoiceIdForScenario, type ClientGender } from "@/lib/voice/voice-catalog";

/**
 * Full per-participant config persisted on Scenario.participantsConfig.
 * `persona` and `voiceId` are server-only and must never be sent to the client
 * during an active session (persona can leak hidden case details).
 */
export type ParticipantConfig = {
  key: string;
  name: string;
  gender: ClientGender;
  ageGroup: string;
  avatarKey: string;
  voiceId: string;
  persona: string;
};

/** Client-safe subset used to render labels and avatars. */
export type PublicParticipant = {
  key: string;
  name: string;
  gender: ClientGender;
  avatarKey: string;
};

const participantConfigSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  gender: z.enum(["female", "male", "neutral"]),
  ageGroup: z.string().min(1),
  avatarKey: z.string().min(1),
  voiceId: z.string().min(1),
  persona: z.string().default(""),
});

/** Lighter shape authored in seeds/scenarios.json; voice/avatar get resolved at seed time. */
const participantSeedSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  gender: z.enum(["female", "male", "neutral"]),
  ageGroup: z.string().min(1).default("adult"),
  persona: z.string().default(""),
});

export type ParticipantSeed = z.infer<typeof participantSeedSchema>;

/** Parse the stored JSON config into validated participants (or null when absent/invalid). */
export function parseParticipantsConfig(raw: unknown): ParticipantConfig[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const parsed = z.array(participantConfigSchema).safeParse(raw);
  if (!parsed.success || parsed.data.length === 0) {
    return null;
  }
  return parsed.data;
}

/** True for scenarios that should run with multiple attributed speakers/avatars. */
export function isMultiSpeakerContext(contextType: string | null | undefined): boolean {
  return contextType === "COUPLES" || contextType === "FAMILY";
}

/** Strip server-only fields before sending to the browser. */
export function toPublicParticipants(configs: ParticipantConfig[]): PublicParticipant[] {
  return configs.map(({ key, name, gender, avatarKey }) => ({ key, name, gender, avatarKey }));
}

export function findParticipantByKey(
  configs: ParticipantConfig[],
  key: string | null | undefined,
): ParticipantConfig | null {
  if (!key) {
    return null;
  }
  return configs.find((p) => p.key === key) ?? null;
}

/** Resolve seed-authored participants into full configs (voice + avatar per person). */
export function resolveParticipantsConfig(seeds: unknown): ParticipantConfig[] | null {
  if (!Array.isArray(seeds) || seeds.length === 0) {
    return null;
  }
  const parsed = z.array(participantSeedSchema).safeParse(seeds);
  if (!parsed.success || parsed.data.length === 0) {
    return null;
  }

  return parsed.data.map((seed) => {
    const settings = { clientGender: seed.gender };
    return {
      key: seed.key,
      name: seed.name,
      gender: seed.gender,
      ageGroup: seed.ageGroup,
      avatarKey: resolveClientAvatarKeyForScenario({
        ageGroup: seed.ageGroup,
        generationSettings: settings,
      }),
      voiceId: resolveClientVoiceIdForScenario({
        ageGroup: seed.ageGroup,
        generationSettings: settings,
      }),
      persona: seed.persona,
    } satisfies ParticipantConfig;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type SpeakerSegment = { speaker: string; text: string };

/**
 * Split a couples/family reply into ordered per-speaker segments.
 * Recognizes both `[Name] ...` and line-leading `Name: ...` tags. Untagged
 * leading text and tag-less replies fall back to the first participant so the
 * turn still renders with an avatar and voice.
 */
export function parseSpeakerSegments(
  text: string,
  participants: ParticipantConfig[],
): SpeakerSegment[] {
  const trimmed = text.trim();
  if (participants.length === 0) {
    return trimmed ? [{ speaker: "", text: trimmed }] : [];
  }

  const fallbackKey = participants[0].key;
  const nameToKey = new Map<string, string>();
  for (const p of participants) {
    nameToKey.set(p.name.toLowerCase(), p.key);
  }

  const names = participants.map((p) => escapeRegExp(p.name)).join("|");
  const pattern = new RegExp(
    `\\[\\s*(${names})\\s*\\]\\s*:?|(?:^|\\n)\\s*(${names})\\s*:`,
    "gi",
  );

  const matches: { name: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(trimmed)) !== null) {
    const name = match[1] ?? match[2] ?? "";
    matches.push({ name, start: match.index, end: pattern.lastIndex });
  }

  if (matches.length === 0) {
    return trimmed ? [{ speaker: fallbackKey, text: trimmed }] : [];
  }

  const segments: SpeakerSegment[] = [];

  const leading = trimmed.slice(0, matches[0].start).trim();
  if (leading) {
    segments.push({ speaker: fallbackKey, text: leading });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const sliceEnd = i + 1 < matches.length ? matches[i + 1].start : trimmed.length;
    const body = trimmed.slice(current.end, sliceEnd).trim();
    if (!body) {
      continue;
    }
    const speaker = nameToKey.get(current.name.toLowerCase()) ?? fallbackKey;
    const last = segments.at(-1);
    if (last && last.speaker === speaker) {
      last.text = `${last.text} ${body}`.trim();
    } else {
      segments.push({ speaker, text: body });
    }
  }

  return segments.length > 0 ? segments : [{ speaker: fallbackKey, text: trimmed }];
}

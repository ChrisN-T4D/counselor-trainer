import { readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { resolveClientVoiceIdForScenario } from "../src/lib/voice/voice-catalog";

type ScenarioSeed = {
  title: string;
  contextType:
    | "MEDICAL_FAMILY_THERAPY"
    | "DOCTOR_HANDOFF"
    | "PEDIATRIC_PARENT_CHILD"
    | "INDIVIDUAL"
    | "COUPLES"
    | "FAMILY";
  dsmCategory: string;
  presentingProblem: string;
  systemPrompt: string;
  objectives: string[];
  difficulty: string;
  ageGroup: string;
  acuityLevel: string;
  referralSource?: string;
  sessionParticipants: string[];
  generationSettings?: Prisma.InputJsonValue;
  caseWriteup?: Prisma.InputJsonValue;
  isTemplate?: boolean;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

async function main() {
  const filePath = join(process.cwd(), "seeds", "scenarios.json");
  const scenarios = JSON.parse(readFileSync(filePath, "utf-8")) as ScenarioSeed[];

  for (const scenario of scenarios) {
    const clientVoiceId = resolveClientVoiceIdForScenario({
      ageGroup: scenario.ageGroup,
      generationSettings: scenario.generationSettings,
    });

    await db.scenario.upsert({
      where: { title: scenario.title },
      update: {
        contextType: scenario.contextType,
        dsmCategory: scenario.dsmCategory,
        presentingProblem: scenario.presentingProblem,
        systemPrompt: scenario.systemPrompt,
        objectives: scenario.objectives,
        difficulty: scenario.difficulty,
        ageGroup: scenario.ageGroup,
        acuityLevel: scenario.acuityLevel,
        referralSource: scenario.referralSource,
        sessionParticipants: scenario.sessionParticipants,
        generationSettings: scenario.generationSettings,
        caseWriteup: scenario.caseWriteup,
        clientVoiceId,
        isTemplate: scenario.isTemplate ?? true,
      },
      create: {
        ...scenario,
        clientVoiceId,
        isTemplate: scenario.isTemplate ?? true,
      },
    });
  }

  console.log(`Seeded ${scenarios.length} scenarios`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

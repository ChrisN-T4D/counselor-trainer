import { readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

type ScenarioSeed = {
  title: string;
  dsmCategory: string;
  presentingProblem: string;
  systemPrompt: string;
  objectives: string[];
  difficulty: string;
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
    await db.scenario.upsert({
      where: { title: scenario.title },
      update: {
        dsmCategory: scenario.dsmCategory,
        presentingProblem: scenario.presentingProblem,
        systemPrompt: scenario.systemPrompt,
        objectives: scenario.objectives,
        difficulty: scenario.difficulty,
      },
      create: scenario,
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

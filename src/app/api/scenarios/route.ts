import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { PUBLIC_SCENARIO_SELECT } from "@/lib/scenarios/public-scenario";

const contextTypeSchema = z.enum([
  "MEDICAL_FAMILY_THERAPY",
  "DOCTOR_HANDOFF",
  "PEDIATRIC_PARENT_CHILD",
  "INDIVIDUAL",
  "COUPLES",
  "FAMILY",
]);

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contextTypeParam = searchParams.get("contextType");
  const difficulty = searchParams.get("difficulty");

  let contextType: z.infer<typeof contextTypeSchema> | undefined;
  if (contextTypeParam) {
    const parsed = contextTypeSchema.safeParse(contextTypeParam);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid contextType filter" }, { status: 400 });
    }
    contextType = parsed.data;
  }

  const scenarios = await db.scenario.findMany({
    where: {
      ...(contextType ? { contextType } : {}),
      ...(difficulty ? { difficulty } : {}),
    },
    select: PUBLIC_SCENARIO_SELECT,
    orderBy: { title: "asc" },
  });

  return NextResponse.json({ scenarios });
}

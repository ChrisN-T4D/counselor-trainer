import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scenarios = await db.scenario.findMany({
    orderBy: { title: "asc" },
  });

  return NextResponse.json({ scenarios });
}

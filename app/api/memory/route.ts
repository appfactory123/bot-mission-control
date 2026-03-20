import { NextResponse } from "next/server";
import { getMissionMemory } from "../../../lib/memory";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const memory = await getMissionMemory();
    return NextResponse.json(memory);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load memory" },
      { status: 500 },
    );
  }
}

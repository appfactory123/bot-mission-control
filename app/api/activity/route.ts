import { NextResponse } from "next/server";
import { createActivity, getMissionControlState } from "../../../lib/mission-control";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getMissionControlState();
  return NextResponse.json({ activity: state.activity });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const state = await createActivity(body);
    return NextResponse.json({ activity: state.activity }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create activity" },
      { status: 400 },
    );
  }
}

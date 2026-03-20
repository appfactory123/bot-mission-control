import { NextResponse } from "next/server";
import { createTask, getMissionControlState } from "../../../lib/mission-control";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getMissionControlState();
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const state = await createTask(body);
    return NextResponse.json(state, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 400 },
    );
  }
}

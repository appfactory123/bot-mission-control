import { NextResponse } from "next/server";
import { reviewPullRequest } from "../../../../../lib/mission-control";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ prId: string }> },
) {
  try {
    const { prId } = await params;
    const body = await request.json();
    const state = await reviewPullRequest(prId, body);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to review pull request";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

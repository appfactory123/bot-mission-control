import { NextResponse } from "next/server";
import { deleteTask, updateTask } from "../../../../lib/mission-control";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const body = await request.json();
    const state = await updateTask(taskId, body);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update task";
    const status = message.startsWith("Task not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const state = await deleteTask(taskId);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete task";
    const status = message.startsWith("Task not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

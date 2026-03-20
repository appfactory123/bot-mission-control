import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase-admin";

const MISSION_STATEMENT =
  "Build an autonomous organization of AI agents that turns ideas into deployed systems, documented decisions, and proactive execution.";

function estimateTokenUsage(input: string) {
  return Math.ceil(input.length / 4);
}

export async function syncMissionMemoryFromDatabase() {
  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseAdmin();

  const [{ data: tasks, error: taskError }, { data: activity, error: activityError }, { data: prs, error: prError }] =
    await Promise.all([
      supabase.from("mission_control_tasks").select("id,title,project").order("updated_at", { ascending: false }),
      supabase.from("mission_control_activity").select("detail,created_at").order("created_at", { ascending: false }),
      supabase.from("mission_control_pull_requests").select("summary,testing_notes").order("updated_at", { ascending: false }),
    ]);

  if (taskError) throw new Error(taskError.message);
  if (activityError) throw new Error(activityError.message);
  if (prError && !prError.message.includes("does not exist")) throw new Error(prError.message);

  const taskRows = (tasks ?? []) as { id: string; title: string; project: string }[];
  const activityRows = (activity ?? []) as { detail: string; created_at: string }[];
  const prRows = (prs ?? []) as { summary: string; testing_notes: string | null }[];

  const focusAreas = Array.from(new Set(taskRows.map((task) => task.project))).slice(0, 5);
  const recentTasks = taskRows.slice(0, 5).map((task) => `${task.id} ${task.title}`);
  const recentActivity = activityRows.slice(0, 6).map((item) => item.detail);
  const textForTokenEstimate = [
    ...recentTasks,
    ...recentActivity,
    ...prRows.slice(0, 5).map((pr) => `${pr.summary} ${pr.testing_notes ?? ""}`),
  ].join(" ");

  const today = new Date().toISOString().slice(0, 10);

  const { error: dailyError } = await supabase.from("mission_control_daily_memory").upsert(
    {
      date: today,
      focus_areas: focusAreas,
      summary:
        focusAreas.length > 0
          ? `Today the team is mainly focused on ${focusAreas.join(", ")}.`
          : "No project focus detected yet for today.",
      token_usage_estimated_total: estimateTokenUsage(textForTokenEstimate),
      token_usage_activity_events: activityRows.length,
      token_usage_tasks_tracked: taskRows.length,
      token_usage_pull_requests_tracked: prRows.length,
      highlights: recentActivity.slice(0, 5),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "date" },
  );

  if (dailyError) throw new Error(dailyError.message);

  const { data: longTerm, error: ltReadError } = await supabase
    .from("mission_control_long_term_memory")
    .select("id")
    .eq("id", "default")
    .maybeSingle();
  if (ltReadError) throw new Error(ltReadError.message);

  if (!longTerm) {
    const { error: ltWriteError } = await supabase.from("mission_control_long_term_memory").insert({
      id: "default",
      mission_statement: MISSION_STATEMENT,
      team_roles: [
        "Developer: implements features, creates PRs, fixes issues from QA feedback.",
        "Code Quality QA: reviews PRs, approves/rejects with clear reasoning.",
        "Project Manager (bot): breaks ideas into actionable tasks, tracks visibility and delivery quality.",
      ],
      project_context: [
        "Mission Control centralizes operational visibility for tasks, PRs, activity, and memory.",
        "Task lifecycle is enforced to reduce chaos: TODO -> IN_PROGRESS -> PR_REVIEW -> DONE/FAILED.",
        "Every meaningful action should leave a trace in activity and memory views.",
      ],
      unresolved_questions: [
        "Should token usage be exact from model telemetry or remain estimated?",
        "What retention policy should daily memory follow (7/30/90 days)?",
        "Should long-term memory be editable from UI with approval gates?",
      ],
      principles: [
        "Mission control should centralize retrieval, not leave memory buried in markdown files.",
        "Useful long-term memories: mission statement, team roles, project context, and unresolved questions.",
        "Good memory UX makes prior conversations usable like a journal instead of dead chat history.",
      ],
    });
    if (ltWriteError) throw new Error(ltWriteError.message);
  }
}

import { getMissionControlState } from "./mission-control";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase-admin";

export type DailyMemory = {
  date: string;
  focusAreas: string[];
  summary: string;
  tokenUsage: {
    estimatedTotal: number;
    activityEvents: number;
    tasksTracked: number;
    pullRequestsTracked: number;
  };
  highlights: string[];
};

export type LongTermMemory = {
  missionStatement: string;
  teamRoles: string[];
  projectContext: string[];
  unresolvedQuestions: string[];
  principles: string[];
};

export type MissionMemory = {
  daily: DailyMemory;
  longTerm: LongTermMemory;
};

const MISSION_STATEMENT =
  "Build an autonomous organization of AI agents that turns ideas into deployed systems, documented decisions, and proactive execution.";

function estimateTokenUsage(input: string) {
  return Math.ceil(input.length / 4);
}

async function buildComputedMemory(): Promise<MissionMemory> {
  const state = await getMissionControlState();
  const today = new Date().toISOString().slice(0, 10);

  const focusAreas = Array.from(new Set(state.tasks.map((task) => task.project))).slice(0, 5);
  const recentTasks = state.tasks.slice(0, 5).map((task) => `${task.id} ${task.title}`);
  const recentActivity = state.activity.slice(0, 6).map((item) => item.detail);

  const textForTokenEstimate = [
    ...recentTasks,
    ...recentActivity,
    ...state.pullRequests.slice(0, 5).map((pr) => `${pr.summary} ${pr.testingNotes}`),
  ].join(" ");

  const tokenUsage = {
    estimatedTotal: estimateTokenUsage(textForTokenEstimate),
    activityEvents: state.activity.length,
    tasksTracked: state.tasks.length,
    pullRequestsTracked: state.pullRequests.length,
  };

  const summary =
    focusAreas.length > 0
      ? `Today the team is mainly focused on ${focusAreas.join(", ")}.`
      : "No project focus detected yet for today.";

  return {
    daily: {
      date: today,
      focusAreas,
      summary,
      tokenUsage,
      highlights: recentActivity.slice(0, 5),
    },
    longTerm: {
      missionStatement: MISSION_STATEMENT,
      teamRoles: [
        "Developer: implements features, creates PRs, fixes issues from QA feedback.",
        "Code Quality QA: reviews PRs, approves/rejects with clear reasoning.",
        "Project Manager (bot): breaks ideas into actionable tasks, tracks visibility and delivery quality.",
      ],
      projectContext: [
        "Mission Control centralizes operational visibility for tasks, PRs, activity, and memory.",
        "Task lifecycle is enforced to reduce chaos: TODO -> IN_PROGRESS -> PR_REVIEW -> DONE/FAILED.",
        "Every meaningful action should leave a trace in activity and memory views.",
      ],
      unresolvedQuestions: [
        "Should token usage be exact from model telemetry or remain estimated?",
        "What retention policy should daily memory follow (7/30/90 days)?",
        "Should long-term memory be editable from UI with approval gates?",
      ],
      principles: [
        "Mission control should centralize retrieval, not leave memory buried in markdown files.",
        "Useful long-term memories: mission statement, team roles, project context, and unresolved questions.",
        "Good memory UX makes prior conversations usable like a journal instead of dead chat history.",
      ],
    },
  };
}

async function getOrCreateDbMemory(): Promise<MissionMemory> {
  const supabase = getSupabaseAdmin();
  const computed = await buildComputedMemory();

  const { data: dailyRow, error: dailyError } = await supabase
    .from("mission_control_daily_memory")
    .select("*")
    .eq("date", computed.daily.date)
    .maybeSingle();
  if (dailyError) throw new Error(dailyError.message);

  const { data: longTermRow, error: longTermError } = await supabase
    .from("mission_control_long_term_memory")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (longTermError) throw new Error(longTermError.message);

  if (!dailyRow) {
    const { error } = await supabase.from("mission_control_daily_memory").insert({
      date: computed.daily.date,
      focus_areas: computed.daily.focusAreas,
      summary: computed.daily.summary,
      token_usage_estimated_total: computed.daily.tokenUsage.estimatedTotal,
      token_usage_activity_events: computed.daily.tokenUsage.activityEvents,
      token_usage_tasks_tracked: computed.daily.tokenUsage.tasksTracked,
      token_usage_pull_requests_tracked: computed.daily.tokenUsage.pullRequestsTracked,
      highlights: computed.daily.highlights,
    });
    if (error) throw new Error(error.message);
  }

  if (!longTermRow) {
    const { error } = await supabase.from("mission_control_long_term_memory").insert({
      id: "default",
      mission_statement: computed.longTerm.missionStatement,
      team_roles: computed.longTerm.teamRoles,
      project_context: computed.longTerm.projectContext,
      unresolved_questions: computed.longTerm.unresolvedQuestions,
      principles: computed.longTerm.principles,
    });
    if (error) throw new Error(error.message);
  }

  const { data: freshDaily, error: freshDailyError } = await supabase
    .from("mission_control_daily_memory")
    .select("*")
    .eq("date", computed.daily.date)
    .single();
  if (freshDailyError) throw new Error(freshDailyError.message);

  const { data: freshLongTerm, error: freshLongTermError } = await supabase
    .from("mission_control_long_term_memory")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (freshLongTermError) throw new Error(freshLongTermError.message);

  return {
    daily: {
      date: freshDaily.date,
      focusAreas: freshDaily.focus_areas ?? [],
      summary: freshDaily.summary,
      tokenUsage: {
        estimatedTotal: freshDaily.token_usage_estimated_total ?? 0,
        activityEvents: freshDaily.token_usage_activity_events ?? 0,
        tasksTracked: freshDaily.token_usage_tasks_tracked ?? 0,
        pullRequestsTracked: freshDaily.token_usage_pull_requests_tracked ?? 0,
      },
      highlights: freshDaily.highlights ?? [],
    },
    longTerm: {
      missionStatement: freshLongTerm.mission_statement,
      teamRoles: freshLongTerm.team_roles ?? [],
      projectContext: freshLongTerm.project_context ?? [],
      unresolvedQuestions: freshLongTerm.unresolved_questions ?? [],
      principles: freshLongTerm.principles ?? [],
    },
  };
}

export async function getMissionMemory(): Promise<MissionMemory> {
  if (isSupabaseConfigured()) {
    return getOrCreateDbMemory();
  }

  return buildComputedMemory();
}

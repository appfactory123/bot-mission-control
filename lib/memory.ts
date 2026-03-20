import { getMissionControlState } from "./mission-control";

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
  // lightweight estimate: ~4 chars/token
  return Math.ceil(input.length / 4);
}

export async function getMissionMemory(): Promise<MissionMemory> {
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

  const longTerm: LongTermMemory = {
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
  };

  return {
    daily: {
      date: today,
      focusAreas,
      summary,
      tokenUsage,
      highlights: recentActivity.slice(0, 5),
    },
    longTerm,
  };
}

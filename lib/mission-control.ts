import path from "node:path";
import { promises as fs } from "node:fs";
import {
  activityTones,
  taskAssignees,
  taskPriorities,
  taskStatuses,
  type Activity,
  type ActivityTone,
  type MissionControlState,
  type PullRequest,
  type PullRequestStatus,
  type Task,
  type TaskAssignee,
  type TaskPriority,
  type TaskStatus,
} from "./mission-control-types";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase-admin";

export type CreateTaskInput = {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  assignee: string;
  project: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  activity?: {
    agent: string;
    detail: string;
    tone?: ActivityTone;
  };
};

export type UpdateTaskInput = {
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  assignee?: string;
  project?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  reviewFailedComment?: string | null;
  activity?: {
    agent: string;
    detail: string;
    tone?: ActivityTone;
  };
};

export type CreateActivityInput = {
  agent: string;
  detail: string;
  tone?: ActivityTone;
};

export type CreatePullRequestInput = {
  taskId: string;
  summary: string;
  implementationDetails: string;
  testingNotes: string;
};

export type ReviewPullRequestInput = {
  decision: "APPROVE" | "REJECT";
  reason?: string;
};

export async function deleteTask(taskId: string) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from("mission_control_tasks")
      .select("id,title")
      .eq("id", taskId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }
    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const { error } = await supabase.from("mission_control_tasks").delete().eq("id", taskId);

    if (error) {
      throw new Error(error.message);
    }

    const activityInput = createSupabaseActivityInsert({
      agent: "System",
      detail: `Task deleted (${existing.id}): ${existing.title}`,
      tone: "watch",
    });
    const { error: activityError } = await supabase.from("mission_control_activity").insert({
      id: activityInput.id,
      agent: activityInput.agent,
      detail: activityInput.detail,
      tone: activityInput.tone,
      created_at: activityInput.created_at,
    });
    if (activityError) {
      throw new Error(activityError.message);
    }

    return getMissionControlState();
  }

  return withWriteLock(async () => {
    const state = await readState();
    const deleted = state.tasks.find((task) => task.id === taskId);
    const nextState: MissionControlState = {
      tasks: state.tasks.filter((task) => task.id !== taskId),
      activity: state.activity,
      pullRequests: state.pullRequests ?? [],
    };

    if (nextState.tasks.length === state.tasks.length || !deleted) {
      throw new Error(`Task not found: ${taskId}`);
    }

    nextState.activity = [
      createActivityRecord(state.activity, {
        agent: "System",
        detail: `Task deleted (${deleted.id}): ${deleted.title}`,
        tone: "watch",
      }),
      ...state.activity,
    ];

    await writeState(nextState);
    return refreshDerivedFields(nextState);
  });
}

type TaskRow = {
  id: string;
  title: string;
  description: string;
  acceptance_criteria?: string[] | null;
  assignee: string;
  project: string;
  status: string;
  priority: string;
  review_failed_comment: string | null;
  review_failed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  agent: string;
  detail: string;
  tone: string;
  created_at: string;
};

type PullRequestRow = {
  id: string;
  task_id: string;
  summary: string;
  implementation_details: string;
  testing_notes: string;
  status: PullRequestStatus;
  qa_decision_reason: string | null;
  reviewed_by: "QA" | null;
  created_at: string;
  updated_at: string;
};

const dataFile = path.join(process.cwd(), "data", "mission-control.json");
const globalForStore = globalThis as typeof globalThis & {
  missionControlWriteLock?: Promise<void>;
};

async function withWriteLock<T>(operation: () => Promise<T>) {
  const previous = globalForStore.missionControlWriteLock ?? Promise.resolve();
  let release!: () => void;
  globalForStore.missionControlWriteLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await operation();
  } finally {
    release();
  }
}

function requireText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

function requireAssignee(value: unknown, fieldName: string): TaskAssignee {
  const assignee = requireText(value, fieldName);

  if (!taskAssignees.includes(assignee as TaskAssignee)) {
    throw new Error(`${fieldName} must be Developer or QA`);
  }

  return assignee as TaskAssignee;
}

function requireAcceptanceCriteria(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("acceptanceCriteria is required and must be a non-empty array");
  }

  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  if (cleaned.length === 0) {
    throw new Error("acceptanceCriteria must contain at least one non-empty item");
  }

  return cleaned;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function ensureStore() {
  try {
    await fs.access(dataFile);
  } catch {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.writeFile(dataFile, JSON.stringify(seedState, null, 2));
  }
}

async function readState() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf8");
  return JSON.parse(raw) as MissionControlState;
}

async function writeState(state: MissionControlState) {
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2));
  return state;
}

function nowIso() {
  return new Date().toISOString();
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day ago`;
}

function nextTaskId(tasks: Task[]) {
  const maxNumber = tasks.reduce((max, task) => {
    const value = Number(task.id.replace(/^T-/, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  return `T-${String(maxNumber + 1).padStart(2, "0")}`;
}

function nextActivityId(activity: Activity[]) {
  const maxNumber = activity.reduce((max, item) => {
    const value = Number(item.id.replace(/^A-/, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  return `A-${String(maxNumber + 1).padStart(3, "0")}`;
}

function createEntityId(prefix: "T" | "A") {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function assertStatus(status: string): asserts status is TaskStatus {
  if (!taskStatuses.includes(status as TaskStatus)) {
    throw new Error(`Invalid task status: ${status}`);
  }
}

function assertPriority(priority: string): asserts priority is TaskPriority {
  if (!taskPriorities.includes(priority as TaskPriority)) {
    throw new Error(`Invalid task priority: ${priority}`);
  }
}

function assertTone(tone: string): asserts tone is ActivityTone {
  if (!activityTones.includes(tone as ActivityTone)) {
    throw new Error(`Invalid activity tone: ${tone}`);
  }
}

function assertStatusTransition(current: TaskStatus, next: TaskStatus) {
  if (current === next) return;

  const allowed: Record<TaskStatus, TaskStatus[]> = {
    TODO: ["IN_PROGRESS"],
    IN_PROGRESS: ["PR_REVIEW"],
    PR_REVIEW: ["DONE", "FAILED"],
    DONE: [],
    FAILED: ["IN_PROGRESS"],
  };

  if (!allowed[current].includes(next)) {
    throw new Error(`Invalid status transition: ${current} -> ${next}`);
  }
}

function buildTaskUpdateActivityDetail(existing: Task, next: Task, commentChanged: boolean) {
  const changes: string[] = [];

  if (existing.status !== next.status) changes.push(`status ${existing.status} -> ${next.status}`);
  if (existing.priority !== next.priority) changes.push(`priority ${existing.priority} -> ${next.priority}`);
  if (existing.assignee !== next.assignee) changes.push(`assignee ${existing.assignee} -> ${next.assignee}`);
  if (existing.title !== next.title) changes.push("title updated");
  if (existing.description !== next.description) changes.push("description updated");
  if (commentChanged) changes.push("comment updated");

  if (changes.length === 0) {
    return `Task updated: ${next.title}`;
  }

  return `Task updated (${next.id}): ${changes.join(", ")}`;
}

function createActivityRecord(activity: Activity[], input: CreateActivityInput): Activity {
  const tone = input.tone ?? "active";
  assertTone(tone);
  const createdAt = nowIso();

  return {
    id: nextActivityId(activity),
    agent: requireText(input.agent, "Activity agent"),
    detail: requireText(input.detail, "Activity detail"),
    tone,
    createdAt,
    time: formatRelativeTime(createdAt),
  };
}

function createSupabaseActivityInsert(input: CreateActivityInput) {
  const tone = input.tone ?? "active";
  assertTone(tone);

  return {
    id: createEntityId("A"),
    agent: requireText(input.agent, "Activity agent"),
    detail: requireText(input.detail, "Activity detail"),
    tone,
    created_at: nowIso(),
  };
}

function normalizeStatus(value: string): TaskStatus {
  const mapped: Record<string, TaskStatus> = {
    Backlog: "TODO",
    "In Progress": "IN_PROGRESS",
    Review: "PR_REVIEW",
    Done: "DONE",
    Recurring: "TODO",
    Failed: "FAILED",
  };
  const candidate = (mapped[value] ?? value) as TaskStatus;
  assertStatus(candidate);
  return candidate;
}

function normalizePriority(value: string): TaskPriority {
  const mapped: Record<string, TaskPriority> = { Critical: "HIGH", High: "HIGH", Medium: "MEDIUM", Low: "LOW" };
  const candidate = (mapped[value] ?? value) as TaskPriority;
  assertPriority(candidate);
  return candidate;
}

function normalizeAssignee(value: string): TaskAssignee {
  if (taskAssignees.includes(value as TaskAssignee)) {
    return value as TaskAssignee;
  }
  return "Developer";
}

function refreshDerivedFields(state: MissionControlState): MissionControlState {
  return {
    tasks: state.tasks
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((task) => ({
        ...task,
        updatedAt: formatRelativeTime(task.updatedAt),
      })),
    activity: state.activity
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((item) => ({
        ...item,
        time: formatRelativeTime(item.createdAt),
      })),
    pullRequests: state.pullRequests
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((pr) => ({
        ...pr,
        updatedAt: formatRelativeTime(pr.updatedAt),
      })),
  };
}

export async function getMissionControlState() {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const [
      { data: taskRows, error: taskError },
      { data: activityRows, error: activityError },
      { data: pullRequestRows, error: pullRequestError },
    ] = await Promise.all([
      supabase
        .from("mission_control_tasks")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase
        .from("mission_control_activity")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("mission_control_pull_requests")
        .select("*")
        .order("updated_at", { ascending: false }),
    ]);

    if (taskError) {
      throw new Error(taskError.message);
    }
    if (activityError) {
      throw new Error(activityError.message);
    }
    if (pullRequestError) {
      throw new Error(pullRequestError.message);
    }

    return refreshDerivedFields({
      tasks: ((taskRows ?? []) as TaskRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        acceptanceCriteria: row.acceptance_criteria ?? [],
        assignee: normalizeAssignee(row.assignee),
        project: row.project,
        status: normalizeStatus(row.status),
        priority: normalizePriority(row.priority),
        reviewFailedComment: row.review_failed_comment,
        reviewFailedAt: row.review_failed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      activity: ((activityRows ?? []) as ActivityRow[]).map((row) => ({
        id: row.id,
        agent: row.agent,
        detail: row.detail,
        tone: row.tone as ActivityTone,
        createdAt: row.created_at,
        time: formatRelativeTime(row.created_at),
      })),
      pullRequests: ((pullRequestRows ?? []) as PullRequestRow[]).map((row) => ({
        id: row.id,
        taskId: row.task_id,
        summary: row.summary,
        implementationDetails: row.implementation_details,
        testingNotes: row.testing_notes,
        status: row.status,
        qaDecisionReason: row.qa_decision_reason,
        reviewedBy: row.reviewed_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  }

  const state = await readState();
  return refreshDerivedFields({
    tasks: state.tasks.map((task) => ({
      ...task,
      acceptanceCriteria: task.acceptanceCriteria ?? [],
      assignee: normalizeAssignee(task.assignee as string),
      status: normalizeStatus(task.status as string),
      priority: normalizePriority(task.priority as string),
    })),
    activity: state.activity,
    pullRequests: state.pullRequests ?? [],
  });
}

export async function createTask(input: CreateTaskInput) {
  if (isSupabaseConfigured()) {
    const status = input.status ?? "TODO";
    const priority = input.priority ?? "MEDIUM";
    assertStatus(status);
    assertPriority(priority);
    const title = requireText(input.title, "Task title");
    const assignee = requireAssignee(input.assignee, "Task assignee");
    const project = requireText(input.project, "Task project");
    const acceptanceCriteria = requireAcceptanceCriteria(input.acceptanceCriteria);
    const supabase = getSupabaseAdmin();
    const createdAt = nowIso();

    const { error } = await supabase.from("mission_control_tasks").insert({
      id: createEntityId("T"),
      title,
      description: input.description?.trim() ?? "",
      acceptance_criteria: acceptanceCriteria,
      assignee,
      project,
      status,
      priority,
      review_failed_comment: null,
      review_failed_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    });

    if (error) {
      throw new Error(error.message);
    }

    const activityInput = createSupabaseActivityInsert(
      input.activity ?? {
        agent: "System",
        detail: `Task created (${title}) assigned to ${assignee}`,
        tone: "active",
      },
    );
    const { error: activityError } = await supabase.from("mission_control_activity").insert({
      id: activityInput.id,
      agent: activityInput.agent,
      detail: activityInput.detail,
      tone: activityInput.tone,
      created_at: activityInput.created_at,
    });

    if (activityError) {
      throw new Error(activityError.message);
    }

    return getMissionControlState();
  }

  return withWriteLock(async () => {
    const state = await readState();
    const status = input.status ?? "TODO";
    const priority = input.priority ?? "MEDIUM";
    assertStatus(status);
    assertPriority(priority);
    const title = requireText(input.title, "Task title");
    const assignee = requireAssignee(input.assignee, "Task assignee");
    const project = requireText(input.project, "Task project");
    const acceptanceCriteria = requireAcceptanceCriteria(input.acceptanceCriteria);

    const createdAt = nowIso();
    const task: Task = {
      id: nextTaskId(state.tasks),
      title,
      description: input.description?.trim() ?? "",
      acceptanceCriteria,
      assignee,
      project,
      status,
      priority,
      reviewFailedComment: null,
      reviewFailedAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    const nextState: MissionControlState = {
      tasks: [task, ...state.tasks],
      activity: state.activity,
      pullRequests: state.pullRequests ?? [],
    };

    nextState.activity = [
      createActivityRecord(
        state.activity,
        input.activity ?? {
          agent: "System",
          detail: `Task created (${task.id}) assigned to ${task.assignee}`,
          tone: "active",
        },
      ),
      ...state.activity,
    ];

    await writeState(nextState);
    return refreshDerivedFields(nextState);
  });
}

export async function updateTask(taskId: string, input: UpdateTaskInput) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from("mission_control_tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }
    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const currentStatus = normalizeStatus(existing.status);
    const status = (input.status ?? currentStatus) as TaskStatus;
    const priority = (input.priority ?? normalizePriority(existing.priority)) as TaskPriority;
    assertStatus(status);
    assertPriority(priority);
    assertStatusTransition(currentStatus, status);

    const { error } = await supabase
      .from("mission_control_tasks")
      .update({
        title: input.title?.trim() ?? existing.title,
        description: input.description?.trim() ?? existing.description,
        acceptance_criteria:
          input.acceptanceCriteria !== undefined
            ? requireAcceptanceCriteria(input.acceptanceCriteria)
            : existing.acceptance_criteria ?? [],
        assignee: input.assignee ? requireAssignee(input.assignee, "Task assignee") : normalizeAssignee(existing.assignee),
        project: input.project?.trim() ?? existing.project,
        status,
        priority,
        review_failed_comment:
          input.reviewFailedComment !== undefined
            ? normalizeOptionalText(input.reviewFailedComment)
            : existing.review_failed_comment,
        review_failed_at:
          input.reviewFailedComment !== undefined
            ? normalizeOptionalText(input.reviewFailedComment)
              ? nowIso()
              : null
            : existing.review_failed_at,
        updated_at: nowIso(),
      })
      .eq("id", taskId);

    if (error) {
      throw new Error(error.message);
    }

    const nextTaskForActivity: Task = {
      id: existing.id,
      title: input.title?.trim() ?? existing.title,
      description: input.description?.trim() ?? existing.description,
      acceptanceCriteria:
        input.acceptanceCriteria !== undefined
          ? requireAcceptanceCriteria(input.acceptanceCriteria)
          : existing.acceptance_criteria ?? [],
      assignee: input.assignee ? requireAssignee(input.assignee, "Task assignee") : normalizeAssignee(existing.assignee),
      project: input.project?.trim() ?? existing.project,
      status,
      priority,
      reviewFailedComment:
        input.reviewFailedComment !== undefined
          ? normalizeOptionalText(input.reviewFailedComment)
          : existing.review_failed_comment,
      reviewFailedAt:
        input.reviewFailedComment !== undefined
          ? normalizeOptionalText(input.reviewFailedComment)
            ? nowIso()
            : null
          : existing.review_failed_at,
      createdAt: existing.created_at,
      updatedAt: nowIso(),
    };

    const existingTaskForActivity: Task = {
      id: existing.id,
      title: existing.title,
      description: existing.description,
      acceptanceCriteria: existing.acceptance_criteria ?? [],
      assignee: normalizeAssignee(existing.assignee),
      project: existing.project,
      status: currentStatus,
      priority: normalizePriority(existing.priority),
      reviewFailedComment: existing.review_failed_comment,
      reviewFailedAt: existing.review_failed_at,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    };

    const commentChanged =
      input.reviewFailedComment !== undefined &&
      normalizeOptionalText(input.reviewFailedComment) !== existing.review_failed_comment;

    const activityInput = createSupabaseActivityInsert(
      input.activity ?? {
        agent: "System",
        detail: buildTaskUpdateActivityDetail(existingTaskForActivity, nextTaskForActivity, commentChanged),
        tone: commentChanged || existingTaskForActivity.status !== nextTaskForActivity.status ? "watch" : "active",
      },
    );
    const { error: activityError } = await supabase.from("mission_control_activity").insert({
      id: activityInput.id,
      agent: activityInput.agent,
      detail: activityInput.detail,
      tone: activityInput.tone,
      created_at: activityInput.created_at,
    });

    if (activityError) {
      throw new Error(activityError.message);
    }

    return getMissionControlState();
  }

  return withWriteLock(async () => {
    const state = await readState();
    const taskIndex = state.tasks.findIndex((task) => task.id === taskId);

    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const existing = state.tasks[taskIndex];
    const status = input.status ?? existing.status;
    const priority = input.priority ?? existing.priority;
    assertStatus(status);
    assertPriority(priority);
    assertStatusTransition(existing.status, status);

    const updatedTask: Task = {
      ...existing,
      title: input.title?.trim() ?? existing.title,
      description: input.description?.trim() ?? existing.description,
      acceptanceCriteria:
        input.acceptanceCriteria !== undefined
          ? requireAcceptanceCriteria(input.acceptanceCriteria)
          : existing.acceptanceCriteria,
      assignee: input.assignee ? requireAssignee(input.assignee, "Task assignee") : existing.assignee,
      project: input.project?.trim() ?? existing.project,
      status,
      priority,
      reviewFailedComment:
        input.reviewFailedComment !== undefined
          ? normalizeOptionalText(input.reviewFailedComment)
          : existing.reviewFailedComment,
      reviewFailedAt:
        input.reviewFailedComment !== undefined
          ? normalizeOptionalText(input.reviewFailedComment)
            ? nowIso()
            : null
          : existing.reviewFailedAt,
      updatedAt: nowIso(),
    };

    const tasks = [...state.tasks];
    tasks[taskIndex] = updatedTask;

    const commentChanged =
      input.reviewFailedComment !== undefined &&
      normalizeOptionalText(input.reviewFailedComment) !== existing.reviewFailedComment;

    const activity = [
      createActivityRecord(
        state.activity,
        input.activity ?? {
          agent: "System",
          detail: buildTaskUpdateActivityDetail(existing, updatedTask, commentChanged),
          tone: commentChanged || existing.status !== updatedTask.status ? "watch" : "active",
        },
      ),
      ...state.activity,
    ];

    const nextState = { tasks, activity, pullRequests: state.pullRequests ?? [] };
    await writeState(nextState);
    return refreshDerivedFields(nextState);
  });
}

export async function createActivity(input: CreateActivityInput) {
  if (isSupabaseConfigured()) {
    const activity = createSupabaseActivityInsert(input);
    const { error } = await getSupabaseAdmin().from("mission_control_activity").insert({
      id: activity.id,
      agent: activity.agent,
      detail: activity.detail,
      tone: activity.tone,
      created_at: activity.created_at,
    });

    if (error) {
      throw new Error(error.message);
    }

    return getMissionControlState();
  }

  return withWriteLock(async () => {
    const state = await readState();
    const activity = [createActivityRecord(state.activity, input), ...state.activity];
    const nextState = { ...state, activity };
    await writeState(nextState);
    return refreshDerivedFields(nextState);
  });
}

export async function createPullRequest(input: CreatePullRequestInput) {
  const summary = requireText(input.summary, "PR summary");
  const implementationDetails = requireText(input.implementationDetails, "PR implementationDetails");
  const testingNotes = requireText(input.testingNotes, "PR testingNotes");

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: task, error: taskError } = await supabase
      .from("mission_control_tasks")
      .select("id,status")
      .eq("id", input.taskId)
      .maybeSingle();

    if (taskError) throw new Error(taskError.message);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);
    if (normalizeStatus(task.status) !== "IN_PROGRESS") {
      throw new Error("PR can only be created when task is IN_PROGRESS");
    }

    const createdAt = nowIso();
    const prId = createEntityId("A");
    const { error: prError } = await supabase.from("mission_control_pull_requests").insert({
      id: prId,
      task_id: input.taskId,
      summary,
      implementation_details: implementationDetails,
      testing_notes: testingNotes,
      status: "OPEN",
      qa_decision_reason: null,
      reviewed_by: null,
      created_at: createdAt,
      updated_at: createdAt,
    });
    if (prError) throw new Error(prError.message);

    const { error: taskUpdateError } = await supabase
      .from("mission_control_tasks")
      .update({ status: "PR_REVIEW", updated_at: nowIso() })
      .eq("id", input.taskId);
    if (taskUpdateError) throw new Error(taskUpdateError.message);

    return getMissionControlState();
  }

  return withWriteLock(async () => {
    const state = await readState();
    const task = state.tasks.find((item) => item.id === input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);
    if (normalizeStatus(task.status as string) !== "IN_PROGRESS") {
      throw new Error("PR can only be created when task is IN_PROGRESS");
    }

    const createdAt = nowIso();
    const pr: PullRequest = {
      id: createEntityId("A"),
      taskId: input.taskId,
      summary,
      implementationDetails,
      testingNotes,
      status: "OPEN",
      qaDecisionReason: null,
      reviewedBy: null,
      createdAt,
      updatedAt: createdAt,
    };

    const nextState: MissionControlState = {
      tasks: state.tasks.map((item) =>
        item.id === input.taskId ? { ...item, status: "PR_REVIEW", updatedAt: nowIso() } : item,
      ),
      activity: state.activity,
      pullRequests: [pr, ...(state.pullRequests ?? [])],
    };

    await writeState(nextState);
    return refreshDerivedFields(nextState);
  });
}

export async function reviewPullRequest(prId: string, input: ReviewPullRequestInput) {
  const decisionStatus: PullRequestStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  if (decisionStatus === "REJECTED" && !input.reason?.trim()) {
    throw new Error("QA rejection reason is required");
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { data: pr, error: prError } = await supabase
      .from("mission_control_pull_requests")
      .select("*")
      .eq("id", prId)
      .maybeSingle();
    if (prError) throw new Error(prError.message);
    if (!pr) throw new Error(`PR not found: ${prId}`);

    const reason = input.reason?.trim() ?? null;
    const { error: reviewError } = await supabase
      .from("mission_control_pull_requests")
      .update({
        status: decisionStatus,
        qa_decision_reason: reason,
        reviewed_by: "QA",
        updated_at: nowIso(),
      })
      .eq("id", prId);
    if (reviewError) throw new Error(reviewError.message);

    const taskStatus: TaskStatus = decisionStatus === "APPROVED" ? "DONE" : "FAILED";
    const { error: taskError } = await supabase
      .from("mission_control_tasks")
      .update({
        status: taskStatus,
        review_failed_comment: decisionStatus === "REJECTED" ? reason : null,
        review_failed_at: decisionStatus === "REJECTED" ? nowIso() : null,
        updated_at: nowIso(),
      })
      .eq("id", pr.task_id);
    if (taskError) throw new Error(taskError.message);

    return getMissionControlState();
  }

  return withWriteLock(async () => {
    const state = await readState();
    const pullRequests = state.pullRequests ?? [];
    const prIndex = pullRequests.findIndex((pr) => pr.id === prId);
    if (prIndex === -1) throw new Error(`PR not found: ${prId}`);

    const reason = input.reason?.trim() ?? null;
    const current = pullRequests[prIndex];
    const nextPR: PullRequest = {
      ...current,
      status: decisionStatus,
      qaDecisionReason: reason,
      reviewedBy: "QA",
      updatedAt: nowIso(),
    };

    const updatedPRs = [...pullRequests];
    updatedPRs[prIndex] = nextPR;

    const nextTaskStatus: TaskStatus = decisionStatus === "APPROVED" ? "DONE" : "FAILED";
    const nextTasks = state.tasks.map((task) =>
      task.id === current.taskId
        ? {
            ...task,
            status: nextTaskStatus,
            reviewFailedComment: decisionStatus === "REJECTED" ? reason : null,
            reviewFailedAt: decisionStatus === "REJECTED" ? nowIso() : null,
            updatedAt: nowIso(),
          }
        : task,
    );

    const nextState: MissionControlState = {
      tasks: nextTasks,
      activity: state.activity,
      pullRequests: updatedPRs,
    };

    await writeState(nextState);
    return refreshDerivedFields(nextState);
  });
}

const seedState: MissionControlState = {
  tasks: [
    {
      id: "T-01",
      title: "Implement strict task lifecycle",
      description: "Enforce TODO > IN_PROGRESS > PR_REVIEW > DONE/FAILED with validation.",
      acceptanceCriteria: [
        "Invalid status transitions are rejected",
        "Only Developer/QA assignee is accepted",
      ],
      assignee: "Developer",
      project: "Mission Control",
      status: "IN_PROGRESS",
      priority: "HIGH",
      reviewFailedComment: null,
      reviewFailedAt: null,
      createdAt: "2026-03-20T03:00:00.000Z",
      updatedAt: "2026-03-20T03:10:00.000Z",
    },
    {
      id: "T-02",
      title: "QA review checklist",
      description: "Define approval/rejection quality gates for PR_REVIEW tasks.",
      acceptanceCriteria: [
        "Reject requires clear reasoning",
        "Approve marks task DONE",
      ],
      assignee: "QA",
      project: "Mission Control",
      status: "TODO",
      priority: "MEDIUM",
      reviewFailedComment: null,
      reviewFailedAt: null,
      createdAt: "2026-03-20T03:11:00.000Z",
      updatedAt: "2026-03-20T03:11:00.000Z",
    },
  ],
  activity: [
    {
      id: "A-004",
      agent: "Henry",
      detail: "Syncing task board with backlog assignments and escalating critical blockers.",
      tone: "active",
      createdAt: "2026-03-19T10:18:00.000Z",
      time: "now",
    },
  ],
  pullRequests: [],
};

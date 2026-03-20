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

export async function deleteTask(taskId: string) {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("mission_control_tasks").delete().eq("id", taskId);

    if (error) {
      throw new Error(error.message);
    }

    return getMissionControlState();
  }

  return withWriteLock(async () => {
    const state = await readState();
    const nextState: MissionControlState = {
      tasks: state.tasks.filter((task) => task.id !== taskId),
      activity: state.activity,
    };

    if (nextState.tasks.length === state.tasks.length) {
      throw new Error(`Task not found: ${taskId}`);
    }

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
  };
}

export async function getMissionControlState() {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    const [{ data: taskRows, error: taskError }, { data: activityRows, error: activityError }] =
      await Promise.all([
        supabase
          .from("mission_control_tasks")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase
          .from("mission_control_activity")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

    if (taskError) {
      throw new Error(taskError.message);
    }
    if (activityError) {
      throw new Error(activityError.message);
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

    if (input.activity) {
      const activityInput = createSupabaseActivityInsert(input.activity);
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
    };

    if (input.activity) {
      nextState.activity = [createActivityRecord(state.activity, input.activity), ...state.activity];
    }

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

    if (input.activity) {
      const activityInput = createSupabaseActivityInsert(input.activity);
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

    let activity = state.activity;
    if (input.activity) {
      activity = [createActivityRecord(state.activity, input.activity), ...state.activity];
    }

    const nextState = { tasks, activity };
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
    {
      id: "A-003",
      agent: "Scout",
      detail: "Collected three overnight signals for the morning market scan cron.",
      tone: "watch",
      createdAt: "2026-03-19T10:14:00.000Z",
      time: "4 min ago",
    },
    {
      id: "A-002",
      agent: "Charlie",
      detail: "Delivered a first-pass component inventory for the office scene.",
      tone: "complete",
      createdAt: "2026-03-19T10:01:00.000Z",
      time: "17 min ago",
    },
    {
      id: "A-001",
      agent: "Violet",
      detail: "Tagged March 18 memory clusters into product, ops, and personal threads.",
      tone: "watch",
      createdAt: "2026-03-19T09:49:00.000Z",
      time: "29 min ago",
    },
  ],
};

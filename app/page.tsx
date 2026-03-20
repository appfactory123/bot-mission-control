"use client";

import { FormEvent, useEffect, useState } from "react";
import { bots } from "../lib/bots";
import {
  taskAssignees,
  taskPriorities,
  taskStatuses,
  type MissionControlState,
  type TaskAssignee,
  type TaskPriority,
  type TaskStatus,
} from "../lib/mission-control-types";

type ViewKey =
  | "tasks"
  | "calendar"
  | "projects"
  | "memory"
  | "docs"
  | "team"
  | "office";

type NavItem = {
  key: ViewKey;
  label: string;
  icon: string;
};

type Event = {
  title: string;
  time: string;
  cadence: string;
  owner: string;
  status: "Queued" | "Running" | "Healthy";
};

type Project = {
  name: string;
  progress: number;
  focus: string;
  health: string;
  nextAction: string;
};

type MemoryDay = {
  day: string;
  summary: string;
  memories: string[];
};

type DocItem = {
  title: string;
  type: string;
  project: string;
  updatedAt: string;
  excerpt: string;
};

const navItems: NavItem[] = [
  { key: "tasks", label: "Tasks", icon: "01" },
  { key: "calendar", label: "Calendar", icon: "02" },
  { key: "projects", label: "Projects", icon: "03" },
  { key: "memory", label: "Memory", icon: "04" },
  { key: "docs", label: "Docs", icon: "05" },
  { key: "team", label: "Team", icon: "06" },
  { key: "office", label: "Office", icon: "07" },
];

const missionStatement =
  "Build an autonomous organization of AI agents that turns ideas into deployed systems, documented decisions, and proactive execution.";

const scheduledEvents: Event[] = [
  {
    title: "Morning Briefing",
    time: "07:30",
    cadence: "Daily",
    owner: "Henry",
    status: "Healthy",
  },
  {
    title: "Inbox Zero Sweep",
    time: "12:00",
    cadence: "Weekdays",
    owner: "Scout",
    status: "Queued",
  },
  {
    title: "Newsletter Draft",
    time: "16:00",
    cadence: "Thursday",
    owner: "Henry",
    status: "Running",
  },
  {
    title: "Nightly Memory Compression",
    time: "23:10",
    cadence: "Daily",
    owner: "Violet",
    status: "Healthy",
  },
];

const projects: Project[] = [
  {
    name: "Mission Control",
    progress: 68,
    focus: "Agent orchestration UI",
    health: "On track",
    nextAction: "Connect cards, schedules, docs, and team status into one shell.",
  },
  {
    name: "Memory Core",
    progress: 44,
    focus: "Daily recall and long-term facts",
    health: "Needs schema lock",
    nextAction: "Finalize memory types and retention rules.",
  },
  {
    name: "Content Engine",
    progress: 81,
    focus: "Newsletter + document drafts",
    health: "Strong",
    nextAction: "Add better search and format badges.",
  },
];

const memoryDays: MemoryDay[] = [
  {
    day: "March 19, 2026",
    summary: "Focused on turning mission control from a transcript into a working system.",
    memories: [
      "Need one source of truth for tasks, docs, memory, and schedules.",
      "The UI should feel operational, not like a generic admin panel.",
      "Office view matters because visibility changes trust in autonomous work.",
    ],
  },
  {
    day: "March 18, 2026",
    summary: "Refined the core agent roles and where each model should be used.",
    memories: [
      "Charlie owns engineering and prototype delivery.",
      "Violet handles research and memory grooming.",
      "Scout should remain lightweight and proactive for daily scans.",
    ],
  },
];

const documents: DocItem[] = [
  {
    title: "Mission Control PRD",
    type: "Product",
    project: "Mission Control",
    updatedAt: "Today",
    excerpt: "Defines the left-rail navigation, dashboard cards, and the office simulation rules.",
  },
  {
    title: "Thursday Newsletter Draft",
    type: "Content",
    project: "Content Engine",
    updatedAt: "Thu 16:05",
    excerpt: "A first draft on building agent infrastructure that feels trustworthy and visible.",
  },
  {
    title: "Memory Taxonomy v2",
    type: "Architecture",
    project: "Memory Core",
    updatedAt: "Yesterday",
    excerpt: "Breaks memory into daily notes, durable facts, mission context, and unresolved questions.",
  },
];

const officeSpots = [
  { name: "Henry", zone: "Strategy Desk", state: "Planning", x: 10, y: 18 },
  { name: "Charlie", zone: "Build Bay", state: "Coding", x: 40, y: 55 },
  { name: "Violet", zone: "Research Loft", state: "Reading", x: 70, y: 28 },
  { name: "Scout", zone: "Ops Wall", state: "Watching", x: 78, y: 68 },
];

const taskColumns: TaskStatus[] = [...taskStatuses];
const taskPriorityOptions: TaskPriority[] = [...taskPriorities];

const statusTone = {
  Queued: "queued",
  Running: "running",
  Healthy: "healthy",
};

export default function HomePage() {
  const [activeView, setActiveView] = useState<ViewKey>("tasks");
  const [taskState, setTaskState] = useState<MissionControlState>({ tasks: [], activity: [], pullRequests: [] });
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [reviewFailureTaskId, setReviewFailureTaskId] = useState<string | null>(null);
  const [reviewFailureComment, setReviewFailureComment] = useState("");
  const [isSubmittingReviewFailure, setIsSubmittingReviewFailure] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    acceptanceCriteria: "",
    assignee: "Developer" as TaskAssignee,
    project: "Mission Control",
    status: "TODO" as TaskStatus,
    priority: "MEDIUM" as TaskPriority,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadTaskState(background = false) {
      if (!background) {
        setTaskLoading(true);
      }

      try {
        const response = await fetch("/api/tasks", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Task API returned ${response.status}`);
        }
        const data = (await response.json()) as MissionControlState;
        if (!cancelled) {
          setTaskState(data);
          setTaskError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setTaskError(error instanceof Error ? error.message : "Failed to load tasks");
        }
      } finally {
        if (!cancelled && !background) {
          setTaskLoading(false);
        }
      }
    }

    void loadTaskState();
    const intervalId = window.setInterval(() => {
      void loadTaskState(true);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const inProgressCount = taskState.tasks.filter((task) => task.status === "IN_PROGRESS").length;
  const completedCount = taskState.tasks.filter((task) => task.status === "DONE").length;

  async function handleSubmitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingTask(true);

    try {
      const isEditing = Boolean(editingTaskId);
      const response = await fetch(isEditing ? `/api/tasks/${editingTaskId}` : "/api/tasks", {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...taskForm,
          acceptanceCriteria: taskForm.acceptanceCriteria
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          reviewFailedComment: null,
          activity: isEditing
            ? {
                agent: taskForm.assignee,
                detail: `Updated task "${taskForm.title}" from mission control.`,
                tone: "active",
              }
            : {
                agent: taskForm.assignee,
                detail: `Created task "${taskForm.title}" from mission control.`,
                tone: "active",
              },
        }),
      });

      const data = (await response.json()) as MissionControlState | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Failed to create task");
      }

      setTaskState(data);
      setTaskError(null);
      setIsTaskModalOpen(false);
      setEditingTaskId(null);
      setTaskForm({
        title: "",
        description: "",
        acceptanceCriteria: "",
        assignee: "Developer",
        project: "Mission Control",
        status: "TODO",
        priority: "MEDIUM",
      });
      setActiveView("tasks");
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : `Failed to ${editingTaskId ? "update" : "create"} task`);
    } finally {
      setIsSubmittingTask(false);
    }
  }

  async function handleDeleteTask() {
    if (!deletingTaskId) {
      return;
    }

    setIsDeletingTask(true);

    try {
      const response = await fetch(`/api/tasks/${deletingTaskId}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as MissionControlState | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Failed to delete task");
      }

      setTaskState(data);
      setTaskError(null);
      setDeletingTaskId(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Failed to delete task");
    } finally {
      setIsDeletingTask(false);
    }
  }

  async function handleReviewFailure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reviewFailureTaskId) {
      return;
    }

    setIsSubmittingReviewFailure(true);

    try {
      const response = await fetch(`/api/tasks/${reviewFailureTaskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "FAILED",
          reviewFailedComment: reviewFailureComment,
          activity: {
            agent: "Alex",
            detail: `Review failed: ${reviewFailureComment}`,
            tone: "watch",
          },
        }),
      });

      const data = (await response.json()) as MissionControlState | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Failed to send task back to backlog");
      }

      setTaskState(data);
      setTaskError(null);
      setReviewFailureTaskId(null);
      setReviewFailureComment("");
      setActiveView("tasks");
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Failed to send task back to backlog");
    } finally {
      setIsSubmittingReviewFailure(false);
    }
  }

  return (
    <main className="shell">
      <div className="shell__backdrop" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark">MC</div>
          <div>
            <p className="eyebrow">Mission Control</p>
            <h1>Operator Deck</h1>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav__item ${activeView === item.key ? "nav__item--active" : ""}`}
              onClick={() => setActiveView(item.key)}
              type="button"
            >
              <span className="nav__icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <section className="mission-card">
          <p className="eyebrow">Mission statement</p>
          <p>{missionStatement}</p>
        </section>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Autonomous organization</p>
            <h2>{labelFor(activeView)}</h2>
          </div>

          <div className="topbar__actions">
            <button className="ghost-button" type="button">
              Quick find
            </button>
            <button className="ghost-button" type="button">
              Ping Henry
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setActiveView("tasks");
                setEditingTaskId(null);
                setIsTaskModalOpen(true);
              }}
            >
              New task
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <MetricCard label="Tasks closed" value={String(completedCount)} detail="done column" accent="teal" />
          <MetricCard label="In progress" value={String(inProgressCount)} detail="actively moving" accent="blue" />
          <MetricCard label="Scheduled automations" value="12" detail="next run 07:30" accent="amber" />
          <MetricCard label="Live agents" value={String(new Set(taskState.activity.map((item) => item.agent)).size || 4)} detail="heartbeat feed" accent="rose" />
        </section>

        {activeView === "tasks" && (
          <TasksView
            taskState={taskState}
            loading={taskLoading}
            error={taskError}
            onFailReview={(taskId, comment) => {
              setReviewFailureTaskId(taskId);
              setReviewFailureComment(comment);
            }}
            onEditTask={(task) => {
              setEditingTaskId(task.id);
              setTaskForm({
                title: task.title,
                description: task.description,
                acceptanceCriteria: (task.acceptanceCriteria ?? []).join("\n"),
                assignee: task.assignee,
                project: task.project,
                status: task.status,
                priority: task.priority,
              });
              setIsTaskModalOpen(true);
            }}
            onDeleteTask={(taskId) => setDeletingTaskId(taskId)}
          />
        )}
        {activeView === "calendar" && <CalendarView />}
        {activeView === "projects" && <ProjectsView />}
        {activeView === "memory" && <MemoryView />}
        {activeView === "docs" && <DocsView />}
        {activeView === "team" && <TeamView />}
        {activeView === "office" && <OfficeView />}
      </section>

      {isTaskModalOpen && (
        <dialog className="task-dialog" open aria-modal="true">
          <div className="task-dialog__surface">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Create task</p>
                <h3>{editingTaskId ? "Edit task" : "Add work to the board"}</h3>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                disabled={isSubmittingTask}
              >
                Close
              </button>
            </div>

            <form className="task-form" onSubmit={handleSubmitTask}>
              <label className="field">
                <span>Title</span>
                <input
                  value={taskForm.title}
                  onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Investigate failed deploy"
                  required
                />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  value={taskForm.description}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Add the task context for the bot."
                  rows={4}
                />
              </label>

              <label className="field">
                <span>Acceptance Criteria (one per line)</span>
                <textarea
                  value={taskForm.acceptanceCriteria}
                  onChange={(event) =>
                    setTaskForm((current) => ({ ...current, acceptanceCriteria: event.target.value }))
                  }
                  placeholder="Given X...\nWhen Y...\nThen Z..."
                  rows={4}
                  required
                />
              </label>

              <div className="field-grid">
                <label className="field">
                  <span>Assignee</span>
                  <select
                    value={taskForm.assignee}
                    onChange={(event) =>
                      setTaskForm((current) => ({ ...current, assignee: event.target.value as TaskAssignee }))
                    }
                  >
                    {taskAssignees.map((assignee) => (
                      <option key={assignee} value={assignee}>
                        {assignee}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Project</span>
                  <input
                    value={taskForm.project}
                    onChange={(event) =>
                      setTaskForm((current) => ({ ...current, project: event.target.value }))
                    }
                    required
                  />
                </label>
              </div>

              <div className="field-grid">
                <label className="field">
                  <span>Status</span>
                  <select
                    value={taskForm.status}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        status: event.target.value as TaskStatus,
                      }))
                    }
                  >
                    {taskColumns.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Priority</span>
                  <select
                    value={taskForm.priority}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        priority: event.target.value as TaskPriority,
                      }))
                    }
                  >
                    {taskPriorityOptions.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {taskError && <p className="error-text">{taskError}</p>}

              <div className="modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setIsTaskModalOpen(false);
                    setEditingTaskId(null);
                  }}
                  disabled={isSubmittingTask}
                >
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={isSubmittingTask}>
                  {isSubmittingTask ? (editingTaskId ? "Saving..." : "Creating...") : editingTaskId ? "Save changes" : "Create task"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {deletingTaskId && (
        <dialog className="task-dialog" open aria-modal="true">
          <div className="task-dialog__surface">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Delete task</p>
                <h3>Remove this task permanently</h3>
              </div>
            </div>

            <p className="note">This removes the task from the board. It does not delete past activity entries.</p>

            <div className="modal-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setDeletingTaskId(null)}
                disabled={isDeletingTask}
              >
                Cancel
              </button>
              <button className="ghost-button ghost-button--danger" type="button" onClick={handleDeleteTask} disabled={isDeletingTask}>
                {isDeletingTask ? "Deleting..." : "Delete task"}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {reviewFailureTaskId && (
        <dialog className="task-dialog" open aria-modal="true">
          <div className="task-dialog__surface">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Review failed</p>
                <h3>Return task to backlog</h3>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setReviewFailureTaskId(null);
                  setReviewFailureComment("");
                }}
                disabled={isSubmittingReviewFailure}
              >
                Close
              </button>
            </div>

            <form className="task-form" onSubmit={handleReviewFailure}>
              <label className="field">
                <span>Failure comment</span>
                <textarea
                  value={reviewFailureComment}
                  onChange={(event) => setReviewFailureComment(event.target.value)}
                  placeholder="Explain what needs to change before this can be approved."
                  rows={5}
                  required
                />
              </label>

              <div className="modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setReviewFailureTaskId(null);
                    setReviewFailureComment("");
                  }}
                  disabled={isSubmittingReviewFailure}
                >
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={isSubmittingReviewFailure}>
                  {isSubmittingReviewFailure ? "Sending back..." : "Move to backlog"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

    </main>
  );
}

function labelFor(view: ViewKey) {
  return navItems.find((item) => item.key === view)?.label ?? "Mission Control";
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "teal" | "blue" | "amber" | "rose";
}) {
  return (
    <article className={`metric metric--${accent}`}>
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function TasksView({
  taskState,
  loading,
  error,
  onFailReview,
  onEditTask,
  onDeleteTask,
}: {
  taskState: MissionControlState;
  loading: boolean;
  error: string | null;
  onFailReview: (taskId: string, comment: string) => void;
  onEditTask: (task: MissionControlState["tasks"][number]) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  return (
    <div className="content-grid content-grid--tasks">
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Task board</p>
            <h3>Live operational flow</h3>
          </div>
          <div className="pill-row">
            <span className="pill">Synced</span>
            <span className="pill">Bot-assigned</span>
            <span className="pill">{taskState.tasks.length} tracked</span>
          </div>
        </div>

        <div className="api-callout">
          <p className="note">
            Bots can `POST /api/tasks`, `PATCH /api/tasks/:id`, and `POST /api/activity` to keep this board current.
          </p>
        </div>

        {loading && <p className="note">Loading task state...</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="kanban">
          {taskColumns.map((column) => (
            <div key={column} className="kanban__column">
              <div className="kanban__title">
                <span>{column}</span>
                <span>{taskState.tasks.filter((task) => task.status === column).length}</span>
              </div>
              {taskState.tasks
                .filter((task) => task.status === column)
                .map((task) => (
                  <article key={task.id} className="task-card">
                    <div className="task-card__topline">
                      <span className={`priority priority--${task.priority.toLowerCase()}`}>{task.priority}</span>
                      <span>{task.id}</span>
                    </div>
                    <h4>{task.title}</h4>
                    <p>{task.description}</p>
                    {task.acceptanceCriteria?.length ? (
                      <ul>
                        {task.acceptanceCriteria.slice(0, 2).map((criterion) => (
                          <li key={criterion} className="note">• {criterion}</li>
                        ))}
                      </ul>
                    ) : null}
                    {task.reviewFailedComment && (
                      <div className="review-note">
                        <strong>Review failed</strong>
                        <p>{task.reviewFailedComment}</p>
                      </div>
                    )}
                    <div className="task-card__meta">
                      <span>{task.assignee}</span>
                      <span>{task.project}</span>
                      <span>{task.updatedAt}</span>
                    </div>
                    {task.status === "PR_REVIEW" && (
                      <div className="task-card__actions">
                        <button className="icon-button" type="button" onClick={() => onEditTask(task)} aria-label="Edit task">
                          <span aria-hidden="true">E</span>
                        </button>
                        <button
                          className="icon-button icon-button--danger"
                          type="button"
                          onClick={() => onFailReview(task.id, task.reviewFailedComment ?? "")}
                          aria-label="Fail review"
                        >
                          <span aria-hidden="true">R</span>
                        </button>
                        <button
                          className="icon-button icon-button--danger"
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label="Delete task"
                        >
                          <span aria-hidden="true">D</span>
                        </button>
                      </div>
                    )}
                    {task.status !== "PR_REVIEW" && (
                      <div className="task-card__actions">
                        <button className="icon-button" type="button" onClick={() => onEditTask(task)} aria-label="Edit task">
                          <span aria-hidden="true">E</span>
                        </button>
                        <button
                          className="icon-button icon-button--danger"
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label="Delete task"
                        >
                          <span aria-hidden="true">D</span>
                        </button>
                      </div>
                    )}
                  </article>
                ))}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Live activity</p>
            <h3>Agent heartbeat feed</h3>
          </div>
        </div>
        <div className="activity-feed">
          {taskState.activity.map((item) => (
            <article key={item.id} className="activity-item">
              <div className={`signal signal--${item.tone}`} />
              <div>
                <div className="activity-item__title">
                  <strong>{item.agent}</strong>
                  <span>{item.time}</span>
                </div>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function CalendarView() {
  return (
    <div className="content-grid content-grid--calendar">
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Scheduled tasks</p>
            <h3>Cron and proactive work</h3>
          </div>
        </div>

        <div className="calendar-list">
          {scheduledEvents.map((event) => (
            <article key={event.title} className="schedule-card">
              <div>
                <p className="eyebrow">{event.cadence}</p>
                <h4>{event.title}</h4>
              </div>
              <div className="schedule-card__meta">
                <span>{event.time}</span>
                <span>{event.owner}</span>
                <span className={`status status--${statusTone[event.status]}`}>{event.status}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Visibility</p>
            <h3>Why this matters</h3>
          </div>
        </div>
        <div className="stack">
          <p className="note">
            This board exists to verify that proactive work was actually scheduled, not just promised in chat.
          </p>
          <p className="note">
            If an agent says it will do something every morning, it should appear here with an owner, cadence, and state.
          </p>
          <p className="note">
            Healthy automations keep the system trustworthy. Missing ones are actionable gaps, not vague intentions.
          </p>
        </div>
      </section>
    </div>
  );
}

function ProjectsView() {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h3>Major projects in motion</h3>
        </div>
      </div>

      <div className="project-grid">
        {projects.map((project) => (
          <article key={project.name} className="project-card">
            <div className="project-card__header">
              <div>
                <h4>{project.name}</h4>
                <p>{project.focus}</p>
              </div>
              <span className="pill">{project.health}</span>
            </div>
            <div className="progress">
              <div className="progress__bar">
                <div className="progress__fill" style={{ width: `${project.progress}%` }} />
              </div>
              <strong>{project.progress}%</strong>
            </div>
            <p className="note">{project.nextAction}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MemoryView() {
  return (
    <div className="content-grid content-grid--memory">
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Daily memory</p>
            <h3>Recall by day</h3>
          </div>
        </div>
        <div className="memory-list">
          {memoryDays.map((day) => (
            <article key={day.day} className="memory-card">
              <h4>{day.day}</h4>
              <p>{day.summary}</p>
              <ul>
                {day.memories.map((memory) => (
                  <li key={memory}>{memory}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Long-term memory</p>
            <h3>Durable truths</h3>
          </div>
        </div>
        <div className="stack">
          <p className="note">Mission control should centralize retrieval, not leave memory buried in markdown files.</p>
          <p className="note">Useful long-term memories: mission statement, team roles, project context, and unresolved questions.</p>
          <p className="note">Good memory UX makes prior conversations usable like a journal instead of dead chat history.</p>
        </div>
      </section>
    </div>
  );
}

function DocsView() {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Document library</p>
          <h3>Searchable outputs from your agents</h3>
        </div>
      </div>

      <div className="docs-list">
        {documents.map((doc) => (
          <article key={doc.title} className="doc-card">
            <div className="doc-card__header">
              <div>
                <h4>{doc.title}</h4>
                <p>{doc.excerpt}</p>
              </div>
              <span className="pill">{doc.type}</span>
            </div>
            <div className="doc-card__meta">
              <span>{doc.project}</span>
              <span>{doc.updatedAt}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TeamView() {
  return (
    <div className="content-grid content-grid--team">
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Org chart</p>
            <h3>Agents and sub-agents</h3>
          </div>
        </div>
        <div className="team-list">
          {bots.map((agent) => (
            <article key={agent.id} className="team-card">
              <div className="avatar">{agent.name.slice(0, 1)}</div>
              <div>
                <h4>{agent.name}</h4>
                <p>{agent.role}</p>
              </div>
              <span>{agent.model}</span>
              <span>{agent.device}</span>
              <span className="pill">{agent.status}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Mission alignment</p>
            <h3>Single source of intent</h3>
          </div>
        </div>
        <p className="note">{missionStatement}</p>
      </section>
    </div>
  );
}

function OfficeView() {
  return (
    <div className="content-grid content-grid--office">
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Office simulation</p>
            <h3>Where everyone is working</h3>
          </div>
        </div>
        <div className="office">
          <div className="office__grid" />
          {officeSpots.map((spot) => (
            <article
              key={spot.name}
              className="office-agent"
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            >
              <div className="office-agent__sprite">{spot.name.slice(0, 1)}</div>
              <div className="office-agent__label">
                <strong>{spot.name}</strong>
                <span>{spot.state}</span>
              </div>
            </article>
          ))}
          <div className="office__zone office__zone--desk">Strategy Desk</div>
          <div className="office__zone office__zone--build">Build Bay</div>
          <div className="office__zone office__zone--research">Research Loft</div>
          <div className="office__zone office__zone--ops">Ops Wall</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Why keep this view</p>
            <h3>Trust through visibility</h3>
          </div>
        </div>
        <div className="stack">
          {officeSpots.map((spot) => (
            <p key={spot.name} className="note">
              {spot.name} is at {spot.zone} and currently {spot.state.toLowerCase()}.
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

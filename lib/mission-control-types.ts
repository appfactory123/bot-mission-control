export const taskStatuses = ["BACKLOG", "IN_PROGRESS", "PR_REVIEW", "DONE", "FAILED"] as const;
export const taskPriorities = ["LOW", "MEDIUM", "HIGH"] as const;
export const taskAssignees = ["Developer", "QA"] as const;
export const activityTones = ["active", "complete", "watch"] as const;

export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];
export type TaskAssignee = (typeof taskAssignees)[number];
export type ActivityTone = (typeof activityTones)[number];

export type Task = {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  assignee: TaskAssignee;
  project: string;
  status: TaskStatus;
  priority: TaskPriority;
  tag: string | null;
  reviewFailedComment: string | null;
  reviewFailedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type Activity = {
  id: string;
  agent: string;
  detail: string;
  time: string;
  tone: ActivityTone;
  createdAt: string;
};

export type PullRequestStatus = "OPEN" | "APPROVED" | "REJECTED";

export type PullRequest = {
  id: string;
  taskId: string;
  summary: string;
  implementationDetails: string;
  testingNotes: string;
  status: PullRequestStatus;
  qaDecisionReason: string | null;
  reviewedBy: "QA" | null;
  createdAt: string;
  updatedAt: string;
};

export type MissionControlState = {
  tasks: Task[];
  activity: Activity[];
  pullRequests: PullRequest[];
};

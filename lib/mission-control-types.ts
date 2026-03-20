import type { BotId } from "./bots";

export const taskStatuses = ["Recurring", "Backlog", "In Progress", "Review", "Done"] as const;
export const taskPriorities = ["Critical", "High", "Medium"] as const;
export const activityTones = ["active", "complete", "watch"] as const;

export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];
export type ActivityTone = (typeof activityTones)[number];

export type Task = {
  id: string;
  title: string;
  description: string;
  assignee: BotId;
  project: string;
  status: TaskStatus;
  priority: TaskPriority;
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

export type MissionControlState = {
  tasks: Task[];
  activity: Activity[];
};

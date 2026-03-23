export type AppModule = {
  slug: "agents" | "workflows" | "infrastructure" | "marketplace" | "finance" | "ai-providers";
  label: string;
  shortLabel: string;
  description: string;
};

export const appModules: AppModule[] = [
  {
    slug: "agents",
    label: "Agents",
    shortLabel: "Agents",
    description: "Manage autonomous agents, statuses, and assignment policies.",
  },
  {
    slug: "workflows",
    label: "Workflows",
    shortLabel: "Flows",
    description: "Design execution pipelines, schedules, and automation triggers.",
  },
  {
    slug: "infrastructure",
    label: "Infrastructure",
    shortLabel: "Infra",
    description: "Observe runtime health, compute, networking, and deployment surfaces.",
  },
  {
    slug: "marketplace",
    label: "Marketplace",
    shortLabel: "Market",
    description: "Browse templates, shared skills, and operational integrations.",
  },
  {
    slug: "finance",
    label: "Finance",
    shortLabel: "Finance",
    description: "Track cost allocation, consumption trends, and spend controls.",
  },
  {
    slug: "ai-providers",
    label: "AI Providers",
    shortLabel: "AI",
    description: "Configure model vendors, keys, quotas, and provider failover.",
  },
];

export const defaultModule = appModules[0];

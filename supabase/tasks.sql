create table if not exists public.mission_control_tasks (
  id text primary key,
  title text not null,
  description text not null default '',
  assignee text not null,
  project text not null,
  status text not null,
  priority text not null,
  review_failed_comment text,
  review_failed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.mission_control_tasks
  add column if not exists review_failed_comment text;

alter table public.mission_control_tasks
  add column if not exists review_failed_at timestamptz;

create table if not exists public.mission_control_activity (
  id text primary key,
  agent text not null,
  detail text not null,
  tone text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists mission_control_tasks_updated_at_idx
  on public.mission_control_tasks (updated_at desc);

create index if not exists mission_control_activity_created_at_idx
  on public.mission_control_activity (created_at desc);

create table if not exists public.mission_control_pull_requests (
  id text primary key,
  task_id text not null references public.mission_control_tasks(id) on delete cascade,
  summary text not null,
  implementation_details text not null,
  testing_notes text not null,
  status text not null,
  qa_decision_reason text,
  reviewed_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists mission_control_pull_requests_updated_at_idx
  on public.mission_control_pull_requests (updated_at desc);

alter table public.mission_control_tasks
  add column if not exists acceptance_criteria text[] default '{}'::text[];

create table if not exists public.mission_control_daily_memory (
  date date primary key,
  focus_areas text[] not null default '{}'::text[],
  summary text not null default '',
  token_usage_estimated_total integer not null default 0,
  token_usage_activity_events integer not null default 0,
  token_usage_tasks_tracked integer not null default 0,
  token_usage_pull_requests_tracked integer not null default 0,
  highlights text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.mission_control_long_term_memory (
  id text primary key,
  mission_statement text not null,
  team_roles text[] not null default '{}'::text[],
  project_context text[] not null default '{}'::text[],
  unresolved_questions text[] not null default '{}'::text[],
  principles text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

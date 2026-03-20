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

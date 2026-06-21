-- Postgres SQL: employee shift activity records.

create table if not exists public.employee_activity (
  id bigint generated always as identity primary key,
  employee_id bigint references public.customers(id) on delete cascade,
  employee_name text,
  activity_date date not null,
  status text not null default 'on_time' check (status in ('on_time', 'late', 'absent')),
  work_minutes integer not null default 0 check (work_minutes >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  started_location jsonb,
  finished_location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employee_activity
  add column if not exists employee_id bigint references public.customers(id) on delete cascade,
  add column if not exists employee_name text,
  add column if not exists activity_date date,
  add column if not exists status text not null default 'on_time',
  add column if not exists work_minutes integer not null default 0,
  add column if not exists late_minutes integer not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists started_location jsonb,
  add column if not exists finished_location jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.employee_activity
    add constraint employee_activity_status_check
    check (status in ('on_time', 'late', 'absent'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.employee_activity
    add constraint employee_activity_work_minutes_check
    check (work_minutes >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.employee_activity
    add constraint employee_activity_late_minutes_check
    check (late_minutes >= 0);
exception
  when duplicate_object then null;
end $$;

create unique index if not exists employee_activity_employee_date_unique_idx
  on public.employee_activity(employee_id, activity_date)
  where employee_id is not null;

create index if not exists employee_activity_employee_idx
  on public.employee_activity(employee_id, activity_date desc);

create index if not exists employee_activity_date_idx
  on public.employee_activity(activity_date desc);

create index if not exists employee_activity_status_idx
  on public.employee_activity(status);

alter table public.employee_activity enable row level security;

drop policy if exists "Allow read employee_activity" on public.employee_activity;
create policy "Allow read employee_activity"
on public.employee_activity
for select
to authenticated
using (true);

drop policy if exists "Allow insert employee_activity" on public.employee_activity;
create policy "Allow insert employee_activity"
on public.employee_activity
for insert
to authenticated
with check (true);

drop policy if exists "Allow update employee_activity" on public.employee_activity;
create policy "Allow update employee_activity"
on public.employee_activity
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete employee_activity" on public.employee_activity;
create policy "Allow delete employee_activity"
on public.employee_activity
for delete
to authenticated
using (true);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_employee_activity_updated on public.employee_activity;
create trigger trg_employee_activity_updated
before update on public.employee_activity
for each row execute function public.set_updated_at();

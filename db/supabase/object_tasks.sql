-- Supabase SQL: object task lists for web assignment and mobile employee to-do access

create table if not exists public.object_task_lists (
  id bigint generated always as identity primary key,
  object_id bigint not null references public.objects(id) on delete cascade,
  employee_id bigint references public.customers(id) on delete cascade,
  group_id uuid,
  title text not null,
  note text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed')),
  review_status text not null default 'none' check (review_status in ('none', 'pending', 'approved', 'rejected')),
  reviewer_id bigint references public.customers(id) on delete set null,
  review_requested_at timestamptz,
  reviewed_at timestamptz,
  review_comment text,
  review_photo_path text,
  created_by_id bigint,
  created_by_name text,
  created_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.object_task_items (
  id bigint generated always as identity primary key,
  task_list_id bigint not null references public.object_task_lists(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  completed_at timestamptz,
  proof_photo_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.object_task_lists
  add column if not exists object_id bigint references public.objects(id) on delete cascade,
  add column if not exists employee_id bigint references public.customers(id) on delete cascade,
  add column if not exists group_id uuid,
  add column if not exists title text,
  add column if not exists note text,
  add column if not exists due_date date,
  add column if not exists status text not null default 'open',
  add column if not exists review_status text not null default 'none',
  add column if not exists reviewer_id bigint references public.customers(id) on delete set null,
  add column if not exists review_requested_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text,
  add column if not exists review_photo_path text,
  add column if not exists created_by_id bigint,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.object_task_lists
    add constraint object_task_lists_review_status_check
    check (review_status in ('none', 'pending', 'approved', 'rejected'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.object_task_lists
    add constraint object_task_lists_group_employee_unique
    unique (group_id, employee_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.object_task_lists
    alter column employee_id drop not null;
exception
  when undefined_column then null;
end $$;

alter table public.object_task_items
  add column if not exists task_list_id bigint references public.object_task_lists(id) on delete cascade,
  add column if not exists title text,
  add column if not exists is_done boolean not null default false,
  add column if not exists completed_at timestamptz,
  add column if not exists proof_photo_path text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists object_task_lists_object_id_idx on public.object_task_lists(object_id);
create index if not exists object_task_lists_employee_id_idx on public.object_task_lists(employee_id);
create index if not exists object_task_lists_group_id_idx on public.object_task_lists(group_id);
create index if not exists object_task_lists_status_idx on public.object_task_lists(status);
create index if not exists object_task_lists_due_date_idx on public.object_task_lists(due_date);
create index if not exists object_task_lists_review_status_idx on public.object_task_lists(review_status);
create index if not exists object_task_lists_reviewer_id_idx on public.object_task_lists(reviewer_id);
create index if not exists object_task_lists_review_requested_at_idx on public.object_task_lists(review_requested_at);
create index if not exists object_task_lists_review_photo_path_idx on public.object_task_lists(review_photo_path);
create index if not exists object_task_items_task_list_id_idx on public.object_task_items(task_list_id);
create index if not exists object_task_items_is_done_idx on public.object_task_items(is_done);
create index if not exists object_task_items_proof_photo_path_idx on public.object_task_items(proof_photo_path);

alter table public.object_task_lists enable row level security;
alter table public.object_task_items enable row level security;

drop policy if exists "Allow read object_task_lists" on public.object_task_lists;
create policy "Allow read object_task_lists"
on public.object_task_lists
for select
to authenticated
using (true);

drop policy if exists "Allow insert object_task_lists" on public.object_task_lists;
create policy "Allow insert object_task_lists"
on public.object_task_lists
for insert
to authenticated
with check (true);

drop policy if exists "Allow update object_task_lists" on public.object_task_lists;
create policy "Allow update object_task_lists"
on public.object_task_lists
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete object_task_lists" on public.object_task_lists;
create policy "Allow delete object_task_lists"
on public.object_task_lists
for delete
to authenticated
using (true);

drop policy if exists "Allow read object_task_items" on public.object_task_items;
create policy "Allow read object_task_items"
on public.object_task_items
for select
to authenticated
using (true);

drop policy if exists "Allow insert object_task_items" on public.object_task_items;
create policy "Allow insert object_task_items"
on public.object_task_items
for insert
to authenticated
with check (true);

drop policy if exists "Allow update object_task_items" on public.object_task_items;
create policy "Allow update object_task_items"
on public.object_task_items
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete object_task_items" on public.object_task_items;
create policy "Allow delete object_task_items"
on public.object_task_items
for delete
to authenticated
using (true);


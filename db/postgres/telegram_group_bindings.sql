create table if not exists public.telegram_group_bindings (
  id bigint generated always as identity primary key,
  tg_chat_id bigint not null unique,
  object_id bigint not null references public.objects(id) on delete cascade,
  title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_group_bindings_object_id_idx
  on public.telegram_group_bindings(object_id);

alter table public.telegram_group_bindings enable row level security;

drop policy if exists "Allow read telegram_group_bindings" on public.telegram_group_bindings;
create policy "Allow read telegram_group_bindings"
on public.telegram_group_bindings
for select
to authenticated
using (true);

drop policy if exists "Allow insert telegram_group_bindings" on public.telegram_group_bindings;
create policy "Allow insert telegram_group_bindings"
on public.telegram_group_bindings
for insert
to authenticated
with check (true);

drop policy if exists "Allow update telegram_group_bindings" on public.telegram_group_bindings;
create policy "Allow update telegram_group_bindings"
on public.telegram_group_bindings
for update
to authenticated
using (true)
with check (true);

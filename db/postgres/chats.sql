-- Chat rooms
create table if not exists public.chats (
  id bigint generated always as identity primary key,
  title text not null,
  is_group boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Participants
create table if not exists public.chat_members (
  chat_id bigint not null references public.chats(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

-- Messages
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  chat_id bigint not null references public.chats(id) on delete cascade,
  author_id uuid not null,
  content text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

-- Simple updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_chats_updated on public.chats;
create trigger trg_chats_updated
before update on public.chats
for each row execute function public.set_updated_at();

-- RLS (adjust roles to your auth model)
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

-- Policies: allow read to authenticated, write to members
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'chats_read') then
    create policy chats_read on public.chats
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'chats_insert') then
    create policy chats_insert on public.chats
      for insert to authenticated with check (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'chat_members_select') then
    create policy chat_members_select on public.chat_members
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'chat_members_insert') then
    create policy chat_members_insert on public.chat_members
      for insert to authenticated with check (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'chat_messages_select') then
    create policy chat_messages_select on public.chat_messages
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'chat_messages_insert') then
    create policy chat_messages_insert on public.chat_messages
      for insert to authenticated with check (true);
  end if;
end $$;

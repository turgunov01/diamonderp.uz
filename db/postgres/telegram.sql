-- Telegram integration columns and indexes

-- Extend chats with Telegram mapping
alter table public.chats
  add column if not exists tg_chat_id bigint,
  add column if not exists tg_type text,
  add column if not exists object_id bigint references public.objects(id) on delete cascade;

create index if not exists chats_tg_chat_id_idx on public.chats(tg_chat_id);
create index if not exists chats_object_id_idx on public.chats(object_id);

-- Extend chat_members with object and optional tg_user id
alter table public.chat_members
  add column if not exists object_id bigint references public.objects(id) on delete cascade,
  add column if not exists tg_user_id bigint;

create index if not exists chat_members_object_id_idx on public.chat_members(object_id);

-- Extend chat_messages with Telegram linkage
alter table public.chat_messages
  alter column author_id type text using author_id::text,
  add column if not exists object_id bigint references public.objects(id) on delete cascade,
  add column if not exists external_id bigint, -- Telegram message_id
  add column if not exists direction text check (direction in ('in','out')) default 'in',
  add column if not exists status text check (status in ('sent','delivered','error')) default 'sent';

create index if not exists chat_messages_object_id_idx on public.chat_messages(object_id);
create index if not exists chat_messages_external_id_idx on public.chat_messages(external_id);

-- RLS note: policies already allow authenticated; tighten as needed per project.

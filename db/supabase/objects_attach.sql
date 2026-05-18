-- Link all core entities to objects (buildings)
-- Run after objects.sql is applied.

-- 0) extend objects with address/code (safe if already exists)
alter table public.objects
  add column if not exists address text,
  add column if not exists code text unique,
  add column if not exists schedule_type text not null default 'day_12h';

do $$
begin
  alter table public.objects
    add constraint objects_schedule_type_check
    check (schedule_type in ('day_12h', 'night_12h', 'day_8h', 'hourly', 'daily_24h'));
exception
  when duplicate_object then null;
end $$;

-- 1) expenses
alter table public.expenses
  add column if not exists object_id bigint references public.objects(id) on delete restrict;
create index if not exists expenses_object_id_idx on public.expenses(object_id);

-- 2) document templates / dispatches / signed docs
alter table public.document_templates
  add column if not exists object_id bigint references public.objects(id) on delete restrict;
create index if not exists document_templates_object_id_idx on public.document_templates(object_id);

alter table public.document_dispatches
  add column if not exists object_id bigint references public.objects(id) on delete restrict;
create index if not exists document_dispatches_object_id_idx on public.document_dispatches(object_id);

alter table public.signed_documents
  add column if not exists object_id bigint references public.objects(id) on delete restrict;
create index if not exists signed_documents_object_id_idx on public.signed_documents(object_id);

-- 3) customers (HR)
alter table public.customers
  add column if not exists object_id bigint references public.objects(id) on delete restrict;
create index if not exists customers_object_id_idx on public.customers(object_id);

-- 4) chats
alter table public.chats
  add column if not exists object_id bigint references public.objects(id) on delete cascade;
create index if not exists chats_object_id_idx on public.chats(object_id);

alter table public.chat_messages
  add column if not exists object_id bigint references public.objects(id) on delete cascade;
create index if not exists chat_messages_object_id_idx on public.chat_messages(object_id);

alter table public.chat_members
  add column if not exists object_id bigint references public.objects(id) on delete cascade;
create index if not exists chat_members_object_id_idx on public.chat_members(object_id);

-- 5) seed hook: assign existing rows to a default object if needed
-- (Replace 1 with your default object id; or run an update per project)
-- update public.expenses set object_id = 1 where object_id is null;
-- repeat for other tables...

-- 6) RLS tightening example (adjust to your membership model):
-- alter policy "Allow read expenses" on public.expenses using (object_id is not null);
-- and add membership checks against object_members.

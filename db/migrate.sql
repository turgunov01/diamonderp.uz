-- Combined Postgres migration generated from db/postgres/*.sql
-- Generated on 2026-06-20.
-- Source files are separated by headers below.

-- Compatibility for SQL originally written for Supabase/PostgREST.
do $$
begin
  create role authenticated;
exception
  when duplicate_object then null;
end $$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ============================================================================
-- Source: db/postgres/objects.sql
-- ============================================================================

create table if not exists public.objects (
  id bigint generated always as identity primary key,
  name text not null unique,
  description text,
  schedule_type text not null default 'day_12h'
    check (schedule_type in ('day_12h', 'night_12h', 'day_8h', 'hourly', 'daily_24h')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.objects
  add column if not exists schedule_type text not null default 'day_12h';

do $$
begin
  alter table public.objects
    add constraint objects_schedule_type_check
    check (schedule_type in ('day_12h', 'night_12h', 'day_8h', 'hourly', 'daily_24h'));
exception
  when duplicate_object then null;
end $$;

alter table public.objects enable row level security;

drop policy if exists "Allow read for authenticated users" on public.objects;
create policy "Allow read for authenticated users"
on public.objects
for select
to authenticated
using (true);

drop policy if exists "Allow insert for authenticated users" on public.objects;
create policy "Allow insert for authenticated users"
on public.objects
for insert
to authenticated
with check (true);

drop policy if exists "Allow update for authenticated users" on public.objects;
create policy "Allow update for authenticated users"
on public.objects
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete for authenticated users" on public.objects;
create policy "Allow delete for authenticated users"
on public.objects
for delete
to authenticated
using (true);

-- Insert sample zones/objects data
insert into public.objects (name, description, schedule_type)
values
  ('Корпус А', 'Основное здание', 'day_12h'),
  ('Склад 2', 'Складское помещение 2', 'night_12h'),
  ('Офисная башня', 'Офисный центр', 'day_8h'),
  ('ТЦ Север', 'Торговый центр Север', 'day_12h'),
  ('Клиника Запад', 'Медицинское учреждение', 'day_8h'),
  ('Отель Восток', 'Гостиница', 'night_12h'),
  ('Заводская линия 1', 'Производственная линия 1', 'daily_24h'),
  ('Школьный блок C', 'Образовательное учреждение', 'hourly')
on conflict (name) do nothing;


-- ============================================================================
-- Source: db/postgres/buildings_rebuild.sql
-- ============================================================================

-- Full rebuild for buildings, objects and customers.
-- Run on a clean database or adjust drop statements as needed.

drop table if exists public.customers cascade;
drop table if exists public.objects cascade;
drop table if exists public.buildings cascade;
drop type if exists public.work_shift cascade;

create table public.buildings (
  id bigint generated always as identity primary key,
  name text not null unique,
  logo text,
  description text,
  created_at timestamptz not null default now()
);

create table public.objects (
  id bigint generated always as identity primary key,
  building_id bigint not null references public.buildings(id) on delete cascade,
  name text not null,
  address text,
  description text,
  code text,
  schedule_type text not null default 'day_12h'
    check (schedule_type in ('day_12h', 'night_12h', 'day_8h', 'hourly', 'daily_24h')),
  created_at timestamptz not null default now(),
  constraint objects_building_name_unique unique (building_id, name),
  constraint objects_building_code_unique unique (building_id, code)
);

create index objects_building_id_idx on public.objects(building_id);

create type public.work_shift as enum ('day', 'night');

create table public.customers (
  id bigint generated always as identity primary key,
  building_id bigint references public.buildings(id) on delete set null,
  username text not null unique,
  avatar text not null,
  password text not null,
  phone_number text not null unique,
  passport_file text not null,
  age integer not null check (age >= 18),
  work_shift public.work_shift not null,
  object_pinned text not null default '',
  object_positions text[] not null default '{}',
  base_salary bigint not null default 1000000,
  position_bonus bigint not null default 0,
  salary_currency text not null default 'UZS',
  created_at timestamptz not null default now()
);

create index customers_building_id_idx on public.customers(building_id);

alter table public.buildings enable row level security;
alter table public.objects enable row level security;
alter table public.customers enable row level security;

drop policy if exists "Allow read for authenticated users" on public.buildings;
create policy "Allow read for authenticated users"
on public.buildings
for select
to authenticated
using (true);

drop policy if exists "Allow insert for authenticated users" on public.buildings;
create policy "Allow insert for authenticated users"
on public.buildings
for insert
to authenticated
with check (true);

drop policy if exists "Allow update for authenticated users" on public.buildings;
create policy "Allow update for authenticated users"
on public.buildings
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete for authenticated users" on public.buildings;
create policy "Allow delete for authenticated users"
on public.buildings
for delete
to authenticated
using (true);

drop policy if exists "Allow read for authenticated users" on public.objects;
create policy "Allow read for authenticated users"
on public.objects
for select
to authenticated
using (true);

drop policy if exists "Allow insert for authenticated users" on public.objects;
create policy "Allow insert for authenticated users"
on public.objects
for insert
to authenticated
with check (true);

drop policy if exists "Allow update for authenticated users" on public.objects;
create policy "Allow update for authenticated users"
on public.objects
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete for authenticated users" on public.objects;
create policy "Allow delete for authenticated users"
on public.objects
for delete
to authenticated
using (true);

drop policy if exists "Allow read for authenticated users" on public.customers;
drop policy if exists "Разрешить чтение авторизованным пользователям" on public.customers;
create policy "Разрешить чтение авторизованным пользователям"
on public.customers
for select
to authenticated
using (true);

drop policy if exists "Allow insert for authenticated users" on public.customers;
drop policy if exists "Разрешить добавление авторизованным пользователям" on public.customers;
create policy "Разрешить добавление авторизованным пользователям"
on public.customers
for insert
to authenticated
with check (true);

drop policy if exists "Allow update for authenticated users" on public.customers;
drop policy if exists "Разрешить обновление авторизованным пользователям" on public.customers;
create policy "Разрешить обновление авторизованным пользователям"
on public.customers
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete for authenticated users" on public.customers;
drop policy if exists "Разрешить удаление авторизованным пользователям" on public.customers;
create policy "Разрешить удаление авторизованным пользователям"
on public.customers
for delete
to authenticated
using (true);

insert into storage.buckets (id, name, public)
values
  ('customer-avatars', 'customer-avatars', true),
  ('customer-passports', 'customer-passports', false)
on conflict (id) do update
set public = excluded.public;

insert into public.buildings (name, logo, description)
values
  ('Tashkent City Mall', 'https://api.logobank.uz/media/logos_preview/TCM-01.jpg', 'Main mall building'),
  ('Summit Business Center', 'https://bcsummit.uz/dist/assets/images/logo.svg', 'Business center'),
  ('JW Marriott Hotel Tashkent', 'https://banner2.cleanpng.com/20180603/bvg/avonlllgv.webp', 'Hotel complex')
on conflict (name) do nothing;

insert into public.objects (building_id, name, address, description, code, schedule_type)
select b.id, seed.name, seed.address, seed.description, seed.code, seed.schedule_type
from (
  values
    ('Tashkent City Mall', 'Main Entrance', 'Tashkent, Shaykhantahur', 'Main access point', 'tcm-main-entrance', 'day_12h'),
    ('Tashkent City Mall', 'Parking', 'Tashkent, B1', 'Underground parking', 'tcm-parking', 'night_12h'),
    ('Summit Business Center', 'Lobby', 'Tashkent, Yunusabad', 'Main lobby', 'summit-lobby', 'day_8h'),
    ('Summit Business Center', 'Office Floor 2', 'Tashkent, Floor 2', 'Office floor security', 'summit-floor-2', 'day_8h'),
    ('JW Marriott Hotel Tashkent', 'Reception', 'Tashkent, City center', 'Hotel reception', 'jw-reception', 'day_12h'),
    ('JW Marriott Hotel Tashkent', 'Conference Hall', 'Tashkent, Level 1', 'Conference security zone', 'jw-conf-hall', 'daily_24h')
) as seed(building_name, name, address, description, code, schedule_type)
join public.buildings b on b.name = seed.building_name
on conflict (building_id, name) do nothing;


-- ============================================================================
-- Source: db/postgres/customers.sql
-- ============================================================================

-- Postgres SQL: таблица клиентов для HR

do $$
begin
  create type public.work_shift as enum ('day', 'night');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.customer_status as enum ('pending', 'active', 'inactive', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.salary_type as enum ('fixed', 'hourly');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.customers (
  id bigint generated always as identity primary key,
  building_id bigint references public.buildings(id) on delete set null,
  full_name text not null default '',
  username text not null unique,
  avatar text not null,
  password text not null,
  phone_number text not null,
  passport_file text not null,
  passport_front_path text,
  passport_back_path text,
  age integer not null check (age >= 18),
  work_shift public.work_shift not null,
  object_pinned text not null,
  object_positions text[] not null default '{}',
  salary_type public.salary_type not null default 'fixed',
  hourly_rate bigint not null default 0,
  status public.customer_status not null default 'pending',
  must_change_password boolean not null default true,
  activated_at timestamptz,
  last_login_at timestamptz,
  last_logout_at timestamptz,
  last_login_location jsonb,
  last_logout_location jsonb,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_comment text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- Safe upserts for existing deployments
alter table public.customers
  add column if not exists building_id bigint references public.buildings(id) on delete set null,
  add column if not exists full_name text not null default '',
  add column if not exists passport_front_path text,
  add column if not exists passport_back_path text,
  add column if not exists salary_type public.salary_type not null default 'fixed',
  add column if not exists hourly_rate bigint not null default 0,
  add column if not exists status public.customer_status not null default 'pending',
  add column if not exists must_change_password boolean not null default true,
  add column if not exists activated_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_logout_at timestamptz,
  add column if not exists last_login_location jsonb,
  add column if not exists last_logout_location jsonb,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by bigint,
  add column if not exists deactivation_comment text,
  add column if not exists archived_at timestamptz;

alter table public.customers
  add column if not exists base_salary bigint not null default 1000000;

alter table public.customers
  add column if not exists position_bonus bigint not null default 0;

alter table public.customers
  add column if not exists salary_currency text not null default 'UZS';

alter table public.customers
  add column if not exists role text not null default 'customer';

create index if not exists customers_status_idx
  on public.customers(status, archived_at);
create index if not exists customers_archived_at_idx
  on public.customers(archived_at);
create index if not exists customers_building_id_idx
  on public.customers(building_id);

create unique index if not exists customers_phone_number_unique_idx
on public.customers(phone_number);

alter table public.customers enable row level security;

insert into storage.buckets (id, name, public)
values
  ('customer-avatars', 'customer-avatars', true),
  ('customer-passports', 'customer-passports', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Allow read for authenticated users" on public.customers;
drop policy if exists "Разрешить чтение авторизованным пользователям" on public.customers;
create policy "Разрешить чтение авторизованным пользователям"
on public.customers
for select
to authenticated
using (true);

drop policy if exists "Allow insert for authenticated users" on public.customers;
drop policy if exists "Разрешить добавление авторизованным пользователям" on public.customers;
create policy "Разрешить добавление авторизованным пользователям"
on public.customers
for insert
to authenticated
with check (true);

drop policy if exists "Allow update for authenticated users" on public.customers;
drop policy if exists "Разрешить обновление авторизованным пользователям" on public.customers;
create policy "Разрешить обновление авторизованным пользователям"
on public.customers
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete for authenticated users" on public.customers;
drop policy if exists "Разрешить удаление авторизованным пользователям" on public.customers;
create policy "Разрешить удаление авторизованным пользователям"
on public.customers
for delete
to authenticated
using (true);

insert into public.customers
  (full_name, username, avatar, password, phone_number, passport_file, age, work_shift, object_pinned, object_positions, base_salary, position_bonus, salary_currency, status, must_change_password, activated_at)
values
  ('Alex Smith', 'alex.smith', 'https://i.pravatar.cc/128?u=alex.smith', 'AxS!2026', '+1-202-555-0101', 'passports/alex-smith.pdf', 29, 'day', 'Корпус А', array['Второй этаж', 'Туалет 1', 'Туалет 2'], 1000000, 120000, 'UZS', 'active', false, now()),
  ('Jordan Brown', 'jordan.brown', 'https://i.pravatar.cc/128?u=jordan.brown', 'JbR#2045', '+1-202-555-0102', 'passports/jordan-brown.pdf', 34, 'night', 'Склад 2', array['Первый этаж', 'Зона погрузки', 'Склад 4'], 1000000, 150000, 'UZS', 'active', false, now()),
  ('Taylor Green', 'taylor.green', 'https://i.pravatar.cc/128?u=taylor.green', 'TgX@9831', '+1-202-555-0103', 'passports/taylor-green.pdf', 27, 'day', 'Офисная башня', array['Второй этаж', 'Туалет 3', 'Коридор ресепшена'], 1000000, 90000, 'UZS', 'active', false, now()),
  ('Morgan White', 'morgan.white', 'https://i.pravatar.cc/128?u=morgan.white', 'Mw!1190', '+1-202-555-0104', 'passports/morgan-white.pdf', 31, 'night', 'ТЦ Север', array['Первый этаж', 'Туалет 1', 'Парковка B1'], 1000000, 110000, 'UZS', 'active', false, now()),
  ('Casey Gray', 'casey.gray', 'https://i.pravatar.cc/128?u=casey.gray', 'Cg$5521', '+1-202-555-0105', 'passports/casey-gray.pdf', 25, 'day', 'Клиника Запад', array['Второй этаж', 'Коридор отделения', 'Туалет 2'], 1000000, 70000, 'UZS', 'active', false, now()),
  ('Jamie Johnson', 'jamie.johnson', 'https://i.pravatar.cc/128?u=jamie.johnson', 'Jj%4433', '+1-202-555-0106', 'passports/jamie-johnson.pdf', 38, 'night', 'Отель Восток', array['5 этаж', 'Туалет 1', 'Аварийная лестница'], 1000000, 130000, 'UZS', 'active', false, now()),
  ('Riley Davis', 'riley.davis', 'https://i.pravatar.cc/128?u=riley.davis', 'Rd*7845', '+1-202-555-0107', 'passports/riley-davis.pdf', 30, 'day', 'Заводская линия 1', array['Главный зал', 'Туалет 2', 'Зона C'], 1000000, 80000, 'UZS', 'active', false, now()),
  ('Kelly Wilson', 'kelly.wilson', 'https://i.pravatar.cc/128?u=kelly.wilson', 'Kw&2201', '+1-202-555-0108', 'passports/kelly-wilson.pdf', 33, 'night', 'Школьный блок C', array['Второй этаж', 'Туалет 1', 'Крыло классов'], 1000000, 100000, 'UZS', 'active', false, now())
on conflict (username) do nothing;


-- ============================================================================
-- Source: db/postgres/customer_roles.sql
-- ============================================================================

-- Postgres SQL: customer roles (employee roles) for HR
-- This table powers `/api/customer-roles` and lets you manage role labels and custom roles per building.

begin;

create table if not exists public.customer_roles (
  id bigint generated always as identity primary key,
  building_id bigint references public.buildings(id) on delete cascade,
  code text not null,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists customer_roles_building_id_idx
  on public.customer_roles(building_id);

-- One role code per building (building-specific overrides).
create unique index if not exists customer_roles_building_code_unique_idx
  on public.customer_roles(building_id, code)
  where building_id is not null;

-- One global role code (building_id is null).
create unique index if not exists customer_roles_global_code_unique_idx
  on public.customer_roles(code)
  where building_id is null;

alter table public.customer_roles enable row level security;

drop policy if exists "Allow read for authenticated users" on public.customer_roles;
create policy "Allow read for authenticated users"
on public.customer_roles
for select
to authenticated
using (true);

drop policy if exists "Allow insert for authenticated users" on public.customer_roles;
create policy "Allow insert for authenticated users"
on public.customer_roles
for insert
to authenticated
with check (true);

drop policy if exists "Allow update for authenticated users" on public.customer_roles;
create policy "Allow update for authenticated users"
on public.customer_roles
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete for authenticated users" on public.customer_roles;
create policy "Allow delete for authenticated users"
on public.customer_roles
for delete
to authenticated
using (true);

-- Seed global defaults (can be overridden per-building by inserting the same `code` with `building_id`).
insert into public.customer_roles (building_id, code, label)
values
  (null, 'customer', 'Сотрудник'),
  (null, 'cleaner', 'Клинер'),
  (null, 'manager', 'Менеджер'),
  (null, 'supervisor', 'Супервайзер'),
  (null, 'procurement', 'Закупщик'),
  (null, 'hr', 'HR'),
  (null, 'admin', 'Админ')
on conflict (code) where building_id is null do nothing;

commit;


-- ============================================================================
-- Source: db/postgres/customers_roles_building_1.sql
-- ============================================================================

-- Postgres SQL: mobile role setup for employees in building_id = 1
-- Usage:
-- 1. Review the preview SELECT.
-- 2. Replace placeholder usernames in role_map if needed.
-- 3. Run the script in Postgres SQL editor.

begin;

-- Preview current employees in building 1 before changes.
select
  id,
  building_id,
  full_name,
  username,
  phone_number,
  role,
  work_shift,
  status
from public.customers
where building_id = 1
order by full_name asc, id asc;

-- Optional targeted role assignments for mobile app.
-- Replace example usernames with real usernames from your database.
with role_map(username, new_role) as (
  values
    ('manager.username', 'manager'),
    ('supervisor.username', 'supervisor'),
    ('procurement.username', 'procurement')
)
update public.customers as customer
set role = role_map.new_role
from role_map
where customer.building_id = 1
  and customer.username = role_map.username;

-- Baseline normalization:
-- keep admin/hr/procurement/manager/supervisor as-is,
-- move legacy frontline users from customer to cleaner.
update public.customers
set role = 'cleaner'
where building_id = 1
  and role = 'customer';

-- Final check after changes.
select
  id,
  building_id,
  full_name,
  username,
  phone_number,
  role,
  work_shift,
  status
from public.customers
where building_id = 1
order by role asc, full_name asc, id asc;

commit;

-- Rollback example if needed:
-- update public.customers
-- set role = 'customer'
-- where building_id = 1
--   and role = 'cleaner';


-- ============================================================================
-- Source: db/postgres/chats.sql
-- ============================================================================

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


-- ============================================================================
-- Source: db/postgres/telegram.sql
-- ============================================================================

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


-- ============================================================================
-- Source: db/postgres/telegram_group_bindings.sql
-- ============================================================================

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


-- ============================================================================
-- Source: db/postgres/expenses.sql
-- ============================================================================

-- Postgres SQL: expenses register

create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  title text not null,
  category text not null,
  vendor text not null,
  planned_amount bigint not null default 0,
  actual_amount bigint,
  currency text not null default 'UZS',
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'paid')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_status_idx on public.expenses(status);
create index if not exists expenses_due_date_idx on public.expenses(due_date);

alter table public.expenses enable row level security;

drop policy if exists "Allow read expenses" on public.expenses;
create policy "Allow read expenses"
on public.expenses
for select
to authenticated
using (true);

drop policy if exists "Allow insert expenses" on public.expenses;
create policy "Allow insert expenses"
on public.expenses
for insert
to authenticated
with check (true);

drop policy if exists "Allow update expenses" on public.expenses;
create policy "Allow update expenses"
on public.expenses
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete expenses" on public.expenses;
create policy "Allow delete expenses"
on public.expenses
for delete
to authenticated
using (true);

insert into public.expenses (title, category, vendor, planned_amount, actual_amount, currency, due_date, status, notes)
values
  ('Топливо для объектов', 'Логистика', 'UzOil', 4200000, 4100000, 'UZS', current_date + interval '7 day', 'approved', 'План на следующую неделю'),
  ('СИЗ для сотрудников', 'Безопасность', 'SafeTrade', 2800000, null, 'UZS', current_date + interval '14 day', 'draft', 'Перчатки и каски'),
  ('Хозтовары', 'Операционные', 'Clean Market', 1650000, 1580000, 'UZS', current_date - interval '2 day', 'paid', 'Закрыто по накладной #44')
on conflict do nothing;


-- ============================================================================
-- Source: db/postgres/warehouse.sql
-- ============================================================================

-- Warehouse item catalogue for procurement purchases.

create table if not exists public.warehouse_items (
  id bigint generated always as identity primary key,
  name text not null,
  manufacturer text not null,
  calculation_type text not null check (calculation_type in ('kg', 'liter', 'piece')),
  unit_price bigint not null check (unit_price > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists warehouse_items_identity_idx
on public.warehouse_items (lower(name), lower(manufacturer), calculation_type);

create index if not exists warehouse_items_active_idx on public.warehouse_items(is_active);
create index if not exists warehouse_items_calculation_type_idx on public.warehouse_items(calculation_type);

alter table public.warehouse_items enable row level security;

drop policy if exists "Allow read warehouse items" on public.warehouse_items;
create policy "Allow read warehouse items"
on public.warehouse_items
for select
to authenticated
using (true);

drop policy if exists "Allow insert warehouse items" on public.warehouse_items;
create policy "Allow insert warehouse items"
on public.warehouse_items
for insert
to authenticated
with check (true);

drop policy if exists "Allow update warehouse items" on public.warehouse_items;
create policy "Allow update warehouse items"
on public.warehouse_items
for update
to authenticated
using (true)
with check (true);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_warehouse_items_updated on public.warehouse_items;
create trigger trg_warehouse_items_updated
before update on public.warehouse_items
for each row execute function public.set_updated_at();

alter table public.expenses
  add column if not exists warehouse_item_id bigint references public.warehouse_items(id) on delete restrict,
  add column if not exists quantity numeric(12, 3);

create index if not exists expenses_warehouse_item_id_idx on public.expenses(warehouse_item_id);

insert into public.warehouse_items (name, manufacturer, calculation_type, unit_price)
values
  ('Моющее средство', 'Clean Market', 'liter', 18000),
  ('Перчатки рабочие', 'SafeTrade', 'piece', 7500),
  ('Порошок для стирки', 'EcoChem', 'kg', 22000)
on conflict do nothing;


-- ============================================================================
-- Source: db/postgres/documents.sql
-- ============================================================================

-- Postgres SQL: documents, dispatches and signatures

create table if not exists public.document_templates (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete restrict,
  name text not null,
  description text,
  contract_type text not null default 'gph',
  html text not null default '',
  css text not null default '',
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_dispatches (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete restrict,
  template_id bigint references public.document_templates(id) on delete set null,
  title text not null,
  recipient_ids bigint[] not null default '{}',
  recipient_phones text[] not null default '{}',
  recipient_count integer not null default 0,
  signed_count integer not null default 0,
  status text not null default 'sent' check (status in ('sent', 'partially_signed', 'signed')),
  sent_at timestamptz not null default now()
);

create table if not exists public.signed_documents (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete restrict,
  dispatch_id bigint references public.document_dispatches(id) on delete set null,
  template_id bigint references public.document_templates(id) on delete set null,
  employee_name text not null,
  phone_number text not null,
  signed_at timestamptz not null default now(),
  signed_via text not null default 'mobile',
  file_url text,
  signature_path text,
  signature_json jsonb,
  consent_checked boolean not null default false,
  user_agent text
);

-- Safe alters for existing deployments
alter table public.signed_documents
  add column if not exists signature_path text,
  add column if not exists signature_json jsonb,
  add column if not exists consent_checked boolean not null default false,
  add column if not exists user_agent text;

-- Safe upserts for existing deployments
alter table public.signed_documents
  add column if not exists signature_path text,
  add column if not exists signature_json jsonb,
  add column if not exists consent_checked boolean not null default false,
  add column if not exists user_agent text;

alter table public.document_dispatches
  alter column status drop default,
  alter column status type text using status::text,
  alter column status set default 'sent';

create index if not exists document_templates_object_id_idx on public.document_templates(object_id);
create index if not exists document_dispatches_template_id_idx on public.document_dispatches(template_id);
create index if not exists document_dispatches_object_id_idx on public.document_dispatches(object_id);
create index if not exists signed_documents_template_id_idx on public.signed_documents(template_id);
create index if not exists signed_documents_object_id_idx on public.signed_documents(object_id);
create index if not exists signed_documents_phone_number_idx on public.signed_documents(phone_number);
create index if not exists signed_documents_signature_path_idx on public.signed_documents(signature_path);

alter table public.document_templates enable row level security;
alter table public.document_dispatches enable row level security;
alter table public.signed_documents enable row level security;

drop policy if exists "Allow read document_templates" on public.document_templates;
create policy "Allow read document_templates"
on public.document_templates
for select
to authenticated
using (true);

drop policy if exists "Allow insert document_templates" on public.document_templates;
create policy "Allow insert document_templates"
on public.document_templates
for insert
to authenticated
with check (true);

drop policy if exists "Allow update document_templates" on public.document_templates;
create policy "Allow update document_templates"
on public.document_templates
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow read document_dispatches" on public.document_dispatches;
create policy "Allow read document_dispatches"
on public.document_dispatches
for select
to authenticated
using (true);

drop policy if exists "Allow insert document_dispatches" on public.document_dispatches;
create policy "Allow insert document_dispatches"
on public.document_dispatches
for insert
to authenticated
with check (true);

drop policy if exists "Allow update document_dispatches" on public.document_dispatches;
create policy "Allow update document_dispatches"
on public.document_dispatches
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow read signed_documents" on public.signed_documents;
create policy "Allow read signed_documents"
on public.signed_documents
for select
to authenticated
using (true);

drop policy if exists "Allow insert signed_documents" on public.signed_documents;
create policy "Allow insert signed_documents"
on public.signed_documents
for insert
to authenticated
with check (true);

drop policy if exists "Allow update signed_documents" on public.signed_documents;
create policy "Allow update signed_documents"
on public.signed_documents
for update
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('document-templates', 'document-templates', false)
on conflict (id) do update
set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('document-signatures', 'document-signatures', false)
on conflict (id) do update
set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('document-template-uploads', 'document-template-uploads', false)
on conflict (id) do update
set public = excluded.public;

insert into public.document_templates (name, description, contract_type, html, css, storage_path)
values
  ('ГПХ базовый', 'Шаблон для ГПХ договора', 'gph', '<section><h1>Договор ГПХ</h1><p>{{employee_name}}</p></section>', '', 'seed/gph-template.json'),
  ('NDA сотрудника', 'Соглашение о неразглашении', 'nda', '<section><h1>NDA</h1><p>{{employee_name}}</p></section>', '', 'seed/nda-template.json')
on conflict do nothing;


-- ============================================================================
-- Source: db/postgres/objects_attach.sql
-- ============================================================================

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


-- ============================================================================
-- Source: db/postgres/employee_advances.sql
-- ============================================================================

do $$
begin
  create type public.advance_status as enum ('issued', 'settled', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.employee_advances (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  object_id bigint references public.objects(id) on delete set null,
  building_id bigint references public.buildings(id) on delete set null,
  amount bigint not null check (amount >= 0),
  currency text not null default 'UZS',
  comment text,
  status public.advance_status not null default 'issued',
  issued_by text,
  issued_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists employee_advances_customer_idx on public.employee_advances(customer_id);
create index if not exists employee_advances_status_idx on public.employee_advances(status, issued_at);
create index if not exists employee_advances_object_idx on public.employee_advances(object_id);

alter table public.employee_advances enable row level security;

drop policy if exists "Allow read employee_advances" on public.employee_advances;
create policy "Allow read employee_advances"
on public.employee_advances
for select
to authenticated
using (true);

drop policy if exists "Allow insert employee_advances" on public.employee_advances;
create policy "Allow insert employee_advances"
on public.employee_advances
for insert
to authenticated
with check (true);

drop policy if exists "Allow update employee_advances" on public.employee_advances;
create policy "Allow update employee_advances"
on public.employee_advances
for update
to authenticated
using (true)
with check (true);


-- ============================================================================
-- Source: db/postgres/employee_activity.sql
-- ============================================================================

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


-- ============================================================================
-- Source: db/postgres/employee_activity_times.sql
-- ============================================================================

-- Postgres SQL: фактическое время начала/окончания смены в employee_activity

alter table if exists public.employee_activity
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists started_location jsonb,
  add column if not exists finished_location jsonb;

-- Если в таблице есть created_at, можно один раз бэкофисом проставить started_at:
-- update public.employee_activity
-- set started_at = created_at
-- where started_at is null;


-- ============================================================================
-- Source: db/postgres/employee_location_points.sql
-- ============================================================================

-- Postgres SQL: employee route location points.

create table if not exists public.employee_location_points (
  id bigint generated always as identity primary key,
  employee_id bigint not null references public.customers(id) on delete cascade,
  activity_id bigint references public.employee_activity(id) on delete set null,
  building_id bigint references public.buildings(id) on delete set null,
  recorded_at timestamptz not null default now(),
  captured_at timestamptz,
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  accuracy_meters double precision,
  altitude double precision,
  altitude_accuracy_meters double precision,
  heading double precision,
  speed double precision,
  source text not null default 'mobile' check (source in ('mobile')),
  location jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employee_location_points_employee_idx
  on public.employee_location_points(employee_id, recorded_at desc);

create index if not exists employee_location_points_activity_idx
  on public.employee_location_points(activity_id, recorded_at asc);

create index if not exists employee_location_points_building_idx
  on public.employee_location_points(building_id, recorded_at desc);

alter table public.employee_location_points enable row level security;

drop policy if exists "Allow read employee location points" on public.employee_location_points;
create policy "Allow read employee location points"
on public.employee_location_points
for select
to authenticated
using (true);

drop policy if exists "Allow insert employee location points" on public.employee_location_points;
create policy "Allow insert employee location points"
on public.employee_location_points
for insert
to authenticated
with check (true);


-- ============================================================================
-- Source: db/postgres/object_tasks.sql
-- ============================================================================

-- Postgres SQL: object task lists for web assignment and mobile employee to-do access

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


-- ============================================================================
-- Source: db/postgres/aroma.sql
-- ============================================================================

-- Aroma diffusers schema
create table if not exists public.aroma_devices (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete set null,
  name text not null,
  location text,
  refill_every_days integer not null default 14 check (refill_every_days > 0),
  volume_ml integer not null default 0 check (volume_ml >= 0),
  price_per_refill numeric not null default 0,
  last_refill date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aroma_refills (
  id bigint generated always as identity primary key,
  device_id bigint not null references public.aroma_devices(id) on delete cascade,
  object_id bigint references public.objects(id) on delete set null,
  amount_ml integer not null default 0 check (amount_ml >= 0),
  price numeric not null default 0,
  refilled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists aroma_devices_object_idx on public.aroma_devices(object_id);
create index if not exists aroma_refills_device_idx on public.aroma_refills(device_id);
create index if not exists aroma_refills_object_idx on public.aroma_refills(object_id);

-- RLS
alter table public.aroma_devices enable row level security;
alter table public.aroma_refills enable row level security;

drop policy if exists "Allow read aroma_devices" on public.aroma_devices;
create policy "Allow read aroma_devices"
on public.aroma_devices
for select
to authenticated
using (true);

drop policy if exists "Allow insert aroma_devices" on public.aroma_devices;
create policy "Allow insert aroma_devices"
on public.aroma_devices
for insert
to authenticated
with check (true);

drop policy if exists "Allow update aroma_devices" on public.aroma_devices;
create policy "Allow update aroma_devices"
on public.aroma_devices
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete aroma_devices" on public.aroma_devices;
create policy "Allow delete aroma_devices"
on public.aroma_devices
for delete
to authenticated
using (true);

drop policy if exists "Allow read aroma_refills" on public.aroma_refills;
create policy "Allow read aroma_refills"
on public.aroma_refills
for select
to authenticated
using (true);

drop policy if exists "Allow insert aroma_refills" on public.aroma_refills;
create policy "Allow insert aroma_refills"
on public.aroma_refills
for insert
to authenticated
with check (true);

drop policy if exists "Allow update aroma_refills" on public.aroma_refills;
create policy "Allow update aroma_refills"
on public.aroma_refills
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete aroma_refills" on public.aroma_refills;
create policy "Allow delete aroma_refills"
on public.aroma_refills
for delete
to authenticated
using (true);

-- updated_at trigger for devices
create or replace function public.set_aroma_device_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_aroma_devices_updated on public.aroma_devices;
create trigger trg_aroma_devices_updated
before update on public.aroma_devices
for each row execute function public.set_aroma_device_updated_at();


-- ============================================================================
-- Source: db/postgres/marble.sql
-- ============================================================================

-- Marble crystallization / polishing events
create table if not exists public.marble_events (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete set null,
  type text not null check (type in ('crystallization','polishing')),
  performed_at timestamptz not null default now(),
  team text not null,
  executors text[] not null default '{}',
  area_m2 numeric not null default 0,
  notes text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marble_events_object_idx on public.marble_events(object_id);
create index if not exists marble_events_type_idx on public.marble_events(type);
create index if not exists marble_events_date_idx on public.marble_events(performed_at desc);

-- Trigger to maintain updated_at
create or replace function public.set_marble_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_marble_events_updated on public.marble_events;
create trigger trg_marble_events_updated
before update on public.marble_events
for each row execute function public.set_marble_updated_at();


-- ============================================================================
-- Source: db/postgres/sanitation.sql
-- ============================================================================

-- Sanitation (disinfection & deratization) events
create table if not exists public.sanitation_events (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete set null,
  type text not null check (type in ('disinfection','deratization')),
  performed_at timestamptz not null default now(),
  team text not null,
  executors text[] not null default '{}',
  notes text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sanitation_events_object_idx on public.sanitation_events(object_id);
create index if not exists sanitation_events_type_idx on public.sanitation_events(type);
create index if not exists sanitation_events_performed_idx on public.sanitation_events(performed_at desc);

-- Trigger to maintain updated_at
create or replace function public.set_sanitation_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sanitation_events_updated on public.sanitation_events;
create trigger trg_sanitation_events_updated
before update on public.sanitation_events
for each row execute function public.set_sanitation_updated_at();


-- ============================================================================
-- Source: db/postgres/waste.sql
-- ============================================================================

-- Waste bins and transport history

create table if not exists public.waste_bins (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete set null,
  category text not null check (category in ('Макулатура','Пластик','Общее')),
  volume_m3 numeric not null default 0,
  weight_kg numeric not null default 0,
  status text not null default 'available' check (status in ('available','loaded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waste_reports (
  id bigint generated always as identity primary key,
  bin_id bigint not null references public.waste_bins(id) on delete cascade,
  object_id bigint references public.objects(id) on delete set null, -- legacy field
  category text not null check (category in ('Макулатура','Пластик','Общее')),
  amount_m3 numeric not null default 0,
  amount_kg numeric not null default 0,
  direction text not null default 'out' check (direction in ('in','out')),
  from_object_id bigint references public.objects(id) on delete set null,
  to_object_id bigint references public.objects(id) on delete set null,
  vehicle text,
  photo_url text,
  comment text,
  created_at timestamptz not null default now()
);

-- Safe alters for existing deployments
alter table public.waste_reports
  add column if not exists direction text not null default 'out' check (direction in ('in','out')),
  add column if not exists from_object_id bigint references public.objects(id) on delete set null,
  add column if not exists to_object_id bigint references public.objects(id) on delete set null,
  add column if not exists vehicle text,
  add column if not exists photo_url text,
  add column if not exists comment text;

-- Fix category check constraints (previously mojibake)
alter table public.waste_bins drop constraint if exists waste_bins_category_check;
alter table public.waste_bins add constraint waste_bins_category_check
  check (category in ('Макулатура','Пластик','Общее'));

alter table public.waste_reports drop constraint if exists waste_reports_category_check;
alter table public.waste_reports add constraint waste_reports_category_check
  check (category in ('Макулатура','Пластик','Общее'));

-- Normalize previously stored mojibake values
update public.waste_bins
set category = case
  when category = 'Макулатура' then 'Макулатура'
  when category = 'Пластик' then 'Пластик'
  when category = 'Общее' then 'Общее'
  else category end;

update public.waste_reports
set category = case
  when category = 'Макулатура' then 'Макулатура'
  when category = 'Пластик' then 'Пластик'
  when category = 'Общее' then 'Общее'
  else category end;

create index if not exists waste_reports_bin_id_idx on public.waste_reports(bin_id);
create index if not exists waste_bins_object_idx on public.waste_bins(object_id);
create index if not exists waste_reports_created_idx on public.waste_reports(created_at desc);
create index if not exists waste_reports_direction_idx on public.waste_reports(direction);

-- Update trigger for updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_waste_bins_updated on public.waste_bins;
create trigger trg_waste_bins_updated
before update on public.waste_bins
for each row execute function public.set_updated_at();


-- ============================================================================
-- Source: db/postgres/erp_users.sql
-- ============================================================================

-- Postgres SQL: dashboard ERP users.
-- Default admin login:
--   email: admin@diamond.local
--   password: password123
-- Change this password after the first successful login.

create table if not exists public.erp_users (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'hr', 'procurement')),
  avatar text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  last_logout_at timestamptz,
  last_login_location jsonb,
  last_logout_location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.erp_users
  add column if not exists name text not null default '',
  add column if not exists email text,
  add column if not exists password_hash text,
  add column if not exists role text not null default 'admin',
  add column if not exists avatar text,
  add column if not exists is_active boolean not null default true,
  add column if not exists must_change_password boolean not null default true,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_logout_at timestamptz,
  add column if not exists last_login_location jsonb,
  add column if not exists last_logout_location jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists erp_users_email_unique_idx
  on public.erp_users(lower(email));

create index if not exists erp_users_role_idx
  on public.erp_users(role);

create index if not exists erp_users_is_active_idx
  on public.erp_users(is_active);

alter table public.erp_users enable row level security;

drop policy if exists "Allow read erp_users" on public.erp_users;
create policy "Allow read erp_users"
on public.erp_users
for select
to authenticated
using (true);

drop policy if exists "Allow insert erp_users" on public.erp_users;
create policy "Allow insert erp_users"
on public.erp_users
for insert
to authenticated
with check (true);

drop policy if exists "Allow update erp_users" on public.erp_users;
create policy "Allow update erp_users"
on public.erp_users
for update
to authenticated
using (true)
with check (true);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_erp_users_updated on public.erp_users;
create trigger trg_erp_users_updated
before update on public.erp_users
for each row execute function public.set_updated_at();

insert into public.erp_users (name, email, password_hash, role, avatar, is_active)
values (
  'Administrator',
  'admin@diamond.local',
  '$2b$10$gKoKGVvU2CXcZqKIFLR0H.C899x1eARA98NPpPnxT.6PjT8mwUHyi',
  'admin',
  null,
  true
)
on conflict (lower(email)) do update
set
  name = excluded.name,
  role = excluded.role,
  is_active = true,
  updated_at = now();


-- ============================================================================
-- Source: db/postgres/auth_locations.sql
-- ============================================================================

-- Postgres SQL: auth login/logout geolocation audit.

create table if not exists public.auth_location_events (
  id bigint generated always as identity primary key,
  source text not null check (source in ('erp', 'customer')),
  user_id bigint not null,
  role text not null default '',
  event_type text not null check (event_type in ('login', 'logout')),
  occurred_at timestamptz not null default now(),
  captured_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  altitude double precision,
  altitude_accuracy_meters double precision,
  heading double precision,
  speed double precision,
  location jsonb,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists auth_location_events_user_idx
  on public.auth_location_events(source, user_id, occurred_at desc);

create index if not exists auth_location_events_event_type_idx
  on public.auth_location_events(event_type, occurred_at desc);

alter table if exists public.customers
  add column if not exists last_logout_at timestamptz,
  add column if not exists last_login_location jsonb,
  add column if not exists last_logout_location jsonb;

alter table if exists public.erp_users
  add column if not exists last_login_at timestamptz,
  add column if not exists last_logout_at timestamptz,
  add column if not exists last_login_location jsonb,
  add column if not exists last_logout_location jsonb;

do $$
declare
  can_manage_auth_location_events boolean;
begin
  select pg_get_userbyid(c.relowner) = current_user
    or exists (
      select 1
      from pg_roles
      where rolname = current_user
        and rolsuper
    )
  into can_manage_auth_location_events
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'auth_location_events';

  if can_manage_auth_location_events then
    execute 'alter table public.auth_location_events enable row level security';
    execute 'drop policy if exists "Allow read auth location events" on public.auth_location_events';
    execute 'create policy "Allow read auth location events" on public.auth_location_events for select to authenticated using (true)';
    execute 'drop policy if exists "Allow insert auth location events" on public.auth_location_events';
    execute 'create policy "Allow insert auth location events" on public.auth_location_events for insert to authenticated with check (true)';
  else
    raise notice 'Skipping RLS policies for public.auth_location_events because % is not the table owner.', current_user;
  end if;
end $$;


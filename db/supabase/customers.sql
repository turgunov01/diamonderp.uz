-- Supabase SQL: таблица клиентов для HR

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

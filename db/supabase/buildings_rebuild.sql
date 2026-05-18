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


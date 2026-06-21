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

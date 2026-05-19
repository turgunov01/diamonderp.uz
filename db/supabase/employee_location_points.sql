-- Supabase SQL: employee route location points.

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

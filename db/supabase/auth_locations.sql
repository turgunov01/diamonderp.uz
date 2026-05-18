-- Supabase SQL: auth login/logout geolocation audit.

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

alter table public.auth_location_events enable row level security;

drop policy if exists "Allow read auth location events" on public.auth_location_events;
create policy "Allow read auth location events"
on public.auth_location_events
for select
to authenticated
using (true);

drop policy if exists "Allow insert auth location events" on public.auth_location_events;
create policy "Allow insert auth location events"
on public.auth_location_events
for insert
to authenticated
with check (true);

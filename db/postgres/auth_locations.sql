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

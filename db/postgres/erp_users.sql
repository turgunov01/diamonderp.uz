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

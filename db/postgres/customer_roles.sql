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
  (null, 'customer', 'РЎРѕС‚СЂСѓРґРЅРёРє'),
  (null, 'cleaner', 'РљР»РёРЅРµСЂ'),
  (null, 'manager', 'РњРµРЅРµРґР¶РµСЂ'),
  (null, 'supervisor', 'РЎСѓРїРµСЂРІР°Р№Р·РµСЂ'),
  (null, 'procurement', 'Р—Р°РєСѓРїС‰РёРє'),
  (null, 'hr', 'HR'),
  (null, 'admin', 'РђРґРјРёРЅ')
on conflict (code) where building_id is null do nothing;

commit;

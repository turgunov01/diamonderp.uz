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

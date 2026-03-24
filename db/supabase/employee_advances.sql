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

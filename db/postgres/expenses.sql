-- Postgres SQL: expenses register

create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  title text not null,
  category text not null,
  vendor text not null,
  planned_amount bigint not null default 0,
  actual_amount bigint,
  currency text not null default 'UZS',
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'paid')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_status_idx on public.expenses(status);
create index if not exists expenses_due_date_idx on public.expenses(due_date);

alter table public.expenses enable row level security;

drop policy if exists "Allow read expenses" on public.expenses;
create policy "Allow read expenses"
on public.expenses
for select
to authenticated
using (true);

drop policy if exists "Allow insert expenses" on public.expenses;
create policy "Allow insert expenses"
on public.expenses
for insert
to authenticated
with check (true);

drop policy if exists "Allow update expenses" on public.expenses;
create policy "Allow update expenses"
on public.expenses
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete expenses" on public.expenses;
create policy "Allow delete expenses"
on public.expenses
for delete
to authenticated
using (true);

insert into public.expenses (title, category, vendor, planned_amount, actual_amount, currency, due_date, status, notes)
values
  ('Топливо для объектов', 'Логистика', 'UzOil', 4200000, 4100000, 'UZS', current_date + interval '7 day', 'approved', 'План на следующую неделю'),
  ('СИЗ для сотрудников', 'Безопасность', 'SafeTrade', 2800000, null, 'UZS', current_date + interval '14 day', 'draft', 'Перчатки и каски'),
  ('Хозтовары', 'Операционные', 'Clean Market', 1650000, 1580000, 'UZS', current_date - interval '2 day', 'paid', 'Закрыто по накладной #44')
on conflict do nothing;


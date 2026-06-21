-- Aroma diffusers schema
create table if not exists public.aroma_devices (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete set null,
  name text not null,
  location text,
  refill_every_days integer not null default 14 check (refill_every_days > 0),
  volume_ml integer not null default 0 check (volume_ml >= 0),
  price_per_refill numeric not null default 0,
  last_refill date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aroma_refills (
  id bigint generated always as identity primary key,
  device_id bigint not null references public.aroma_devices(id) on delete cascade,
  object_id bigint references public.objects(id) on delete set null,
  amount_ml integer not null default 0 check (amount_ml >= 0),
  price numeric not null default 0,
  refilled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists aroma_devices_object_idx on public.aroma_devices(object_id);
create index if not exists aroma_refills_device_idx on public.aroma_refills(device_id);
create index if not exists aroma_refills_object_idx on public.aroma_refills(object_id);

-- RLS
alter table public.aroma_devices enable row level security;
alter table public.aroma_refills enable row level security;

drop policy if exists "Allow read aroma_devices" on public.aroma_devices;
create policy "Allow read aroma_devices"
on public.aroma_devices
for select
to authenticated
using (true);

drop policy if exists "Allow insert aroma_devices" on public.aroma_devices;
create policy "Allow insert aroma_devices"
on public.aroma_devices
for insert
to authenticated
with check (true);

drop policy if exists "Allow update aroma_devices" on public.aroma_devices;
create policy "Allow update aroma_devices"
on public.aroma_devices
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete aroma_devices" on public.aroma_devices;
create policy "Allow delete aroma_devices"
on public.aroma_devices
for delete
to authenticated
using (true);

drop policy if exists "Allow read aroma_refills" on public.aroma_refills;
create policy "Allow read aroma_refills"
on public.aroma_refills
for select
to authenticated
using (true);

drop policy if exists "Allow insert aroma_refills" on public.aroma_refills;
create policy "Allow insert aroma_refills"
on public.aroma_refills
for insert
to authenticated
with check (true);

drop policy if exists "Allow update aroma_refills" on public.aroma_refills;
create policy "Allow update aroma_refills"
on public.aroma_refills
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow delete aroma_refills" on public.aroma_refills;
create policy "Allow delete aroma_refills"
on public.aroma_refills
for delete
to authenticated
using (true);

-- updated_at trigger for devices
create or replace function public.set_aroma_device_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_aroma_devices_updated on public.aroma_devices;
create trigger trg_aroma_devices_updated
before update on public.aroma_devices
for each row execute function public.set_aroma_device_updated_at();

-- Waste bins and transport history

create table if not exists public.waste_bins (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete set null,
  category text not null check (category in ('Макулатура','Пластик','Общее')),
  volume_m3 numeric not null default 0,
  weight_kg numeric not null default 0,
  status text not null default 'available' check (status in ('available','loaded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waste_reports (
  id bigint generated always as identity primary key,
  bin_id bigint not null references public.waste_bins(id) on delete cascade,
  object_id bigint references public.objects(id) on delete set null, -- legacy field
  category text not null check (category in ('Макулатура','Пластик','Общее')),
  amount_m3 numeric not null default 0,
  amount_kg numeric not null default 0,
  direction text not null default 'out' check (direction in ('in','out')),
  from_object_id bigint references public.objects(id) on delete set null,
  to_object_id bigint references public.objects(id) on delete set null,
  vehicle text,
  photo_url text,
  comment text,
  created_at timestamptz not null default now()
);

-- Safe alters for existing deployments
alter table public.waste_reports
  add column if not exists direction text not null default 'out' check (direction in ('in','out')),
  add column if not exists from_object_id bigint references public.objects(id) on delete set null,
  add column if not exists to_object_id bigint references public.objects(id) on delete set null,
  add column if not exists vehicle text,
  add column if not exists photo_url text,
  add column if not exists comment text;

-- Fix category check constraints (previously mojibake)
alter table public.waste_bins drop constraint if exists waste_bins_category_check;
alter table public.waste_bins add constraint waste_bins_category_check
  check (category in ('Макулатура','Пластик','Общее'));

alter table public.waste_reports drop constraint if exists waste_reports_category_check;
alter table public.waste_reports add constraint waste_reports_category_check
  check (category in ('Макулатура','Пластик','Общее'));

-- Normalize previously stored mojibake values
update public.waste_bins
set category = case
  when category = 'Макулатура' then 'Макулатура'
  when category = 'Пластик' then 'Пластик'
  when category = 'Общее' then 'Общее'
  else category end;

update public.waste_reports
set category = case
  when category = 'Макулатура' then 'Макулатура'
  when category = 'Пластик' then 'Пластик'
  when category = 'Общее' then 'Общее'
  else category end;

create index if not exists waste_reports_bin_id_idx on public.waste_reports(bin_id);
create index if not exists waste_bins_object_idx on public.waste_bins(object_id);
create index if not exists waste_reports_created_idx on public.waste_reports(created_at desc);
create index if not exists waste_reports_direction_idx on public.waste_reports(direction);

-- Update trigger for updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_waste_bins_updated on public.waste_bins;
create trigger trg_waste_bins_updated
before update on public.waste_bins
for each row execute function public.set_updated_at();

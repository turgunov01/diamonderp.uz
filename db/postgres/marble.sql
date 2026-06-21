-- Marble crystallization / polishing events
create table if not exists public.marble_events (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete set null,
  type text not null check (type in ('crystallization','polishing')),
  performed_at timestamptz not null default now(),
  team text not null,
  executors text[] not null default '{}',
  area_m2 numeric not null default 0,
  notes text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marble_events_object_idx on public.marble_events(object_id);
create index if not exists marble_events_type_idx on public.marble_events(type);
create index if not exists marble_events_date_idx on public.marble_events(performed_at desc);

-- Trigger to maintain updated_at
create or replace function public.set_marble_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_marble_events_updated on public.marble_events;
create trigger trg_marble_events_updated
before update on public.marble_events
for each row execute function public.set_marble_updated_at();

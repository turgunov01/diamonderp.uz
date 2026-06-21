-- Sanitation (disinfection & deratization) events
create table if not exists public.sanitation_events (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete set null,
  type text not null check (type in ('disinfection','deratization')),
  performed_at timestamptz not null default now(),
  team text not null,
  executors text[] not null default '{}',
  notes text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sanitation_events_object_idx on public.sanitation_events(object_id);
create index if not exists sanitation_events_type_idx on public.sanitation_events(type);
create index if not exists sanitation_events_performed_idx on public.sanitation_events(performed_at desc);

-- Trigger to maintain updated_at
create or replace function public.set_sanitation_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sanitation_events_updated on public.sanitation_events;
create trigger trg_sanitation_events_updated
before update on public.sanitation_events
for each row execute function public.set_sanitation_updated_at();

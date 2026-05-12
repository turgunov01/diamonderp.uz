-- Supabase SQL: фактическое время начала/окончания смены в employee_activity

alter table if exists public.employee_activity
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz;

-- Если в таблице есть created_at, можно один раз бэкофисом проставить started_at:
-- update public.employee_activity
-- set started_at = created_at
-- where started_at is null;

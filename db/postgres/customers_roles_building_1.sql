-- Postgres SQL: mobile role setup for employees in building_id = 1
-- Usage:
-- 1. Review the preview SELECT.
-- 2. Replace placeholder usernames in role_map if needed.
-- 3. Run the script in Postgres SQL editor.

begin;

-- Preview current employees in building 1 before changes.
select
  id,
  building_id,
  full_name,
  username,
  phone_number,
  role,
  work_shift,
  status
from public.customers
where building_id = 1
order by full_name asc, id asc;

-- Optional targeted role assignments for mobile app.
-- Replace example usernames with real usernames from your database.
with role_map(username, new_role) as (
  values
    ('manager.username', 'manager'),
    ('supervisor.username', 'supervisor'),
    ('procurement.username', 'procurement')
)
update public.customers as customer
set role = role_map.new_role
from role_map
where customer.building_id = 1
  and customer.username = role_map.username;

-- Baseline normalization:
-- keep admin/hr/procurement/manager/supervisor as-is,
-- move legacy frontline users from customer to cleaner.
update public.customers
set role = 'cleaner'
where building_id = 1
  and role = 'customer';

-- Final check after changes.
select
  id,
  building_id,
  full_name,
  username,
  phone_number,
  role,
  work_shift,
  status
from public.customers
where building_id = 1
order by role asc, full_name asc, id asc;

commit;

-- Rollback example if needed:
-- update public.customers
-- set role = 'customer'
-- where building_id = 1
--   and role = 'cleaner';

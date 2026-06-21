-- Diamond ERP full schema for an empty PostgreSQL 14 database.
-- Target database: app_db
-- Application role: app_user
-- All application tables are created in schema public.

-- ============================================================================
-- Shared enum types and updated_at helper
-- ============================================================================

do $$
begin
  create type public.work_shift as enum ('day', 'night');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.customer_status as enum ('pending', 'active', 'inactive', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.salary_type as enum ('fixed', 'hourly');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.advance_status as enum ('issued', 'settled', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- Buildings and objects
-- Used by /api/buildings, /api/objects, /api/zones, mobile access, schedules.
-- ============================================================================

create table if not exists public.buildings (
  id bigint generated always as identity primary key,
  name text not null,
  logo text,
  description text,
  created_at timestamptz not null default now()
);

create unique index if not exists buildings_name_unique_idx
  on public.buildings(name);

create table if not exists public.objects (
  id bigint generated always as identity primary key,
  building_id bigint references public.buildings(id),
  name text not null,
  address text,
  description text,
  code text,
  schedule_type text not null default 'day_12h'
    check (schedule_type in ('day_12h', 'night_12h', 'day_8h', 'hourly', 'daily_24h')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists objects_building_id_idx
  on public.objects(building_id);

create unique index if not exists objects_building_name_unique_idx
  on public.objects(building_id, name)
  where building_id is not null;

create unique index if not exists objects_building_code_unique_idx
  on public.objects(building_id, code)
  where building_id is not null and code is not null;

create index if not exists objects_is_active_idx
  on public.objects(is_active);

-- ============================================================================
-- ERP users, customers, roles and auth audit
-- Used by auth/login, mobile auth, HR APIs and customer role APIs.
-- ============================================================================

create table if not exists public.erp_users (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'hr', 'procurement')),
  avatar text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  last_logout_at timestamptz,
  last_login_location jsonb,
  last_logout_location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists erp_users_email_unique_idx
  on public.erp_users(lower(email));

create index if not exists erp_users_role_idx
  on public.erp_users(role);

create index if not exists erp_users_is_active_idx
  on public.erp_users(is_active);

create table if not exists public.customers (
  id bigint generated always as identity primary key,
  building_id bigint references public.buildings(id),
  object_id bigint references public.objects(id),
  full_name text not null default '',
  username text not null,
  avatar text not null default '',
  password text not null default '',
  role text not null default 'customer',
  phone_number text not null,
  passport_file text not null default '',
  passport_front_path text,
  passport_back_path text,
  age integer not null default 18 check (age >= 18),
  work_shift public.work_shift not null default 'day',
  object_pinned text not null default '',
  object_positions text[] not null default '{}',
  salary_type public.salary_type not null default 'fixed',
  hourly_rate bigint not null default 0,
  base_salary bigint not null default 1000000,
  position_bonus bigint not null default 0,
  salary_currency text not null default 'UZS',
  status public.customer_status not null default 'pending',
  must_change_password boolean not null default true,
  activated_at timestamptz,
  last_login_at timestamptz,
  last_logout_at timestamptz,
  last_login_location jsonb,
  last_logout_location jsonb,
  deactivated_at timestamptz,
  deactivated_by bigint references public.erp_users(id),
  deactivation_comment text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists customers_username_unique_idx
  on public.customers(username);

create unique index if not exists customers_phone_number_unique_idx
  on public.customers(phone_number);

create index if not exists customers_building_id_idx
  on public.customers(building_id);

create index if not exists customers_object_id_idx
  on public.customers(object_id);

create index if not exists customers_status_idx
  on public.customers(status, archived_at);

create index if not exists customers_archived_at_idx
  on public.customers(archived_at);

create table if not exists public.customer_roles (
  id bigint generated always as identity primary key,
  building_id bigint references public.buildings(id),
  code text not null,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists customer_roles_building_id_idx
  on public.customer_roles(building_id);

create unique index if not exists customer_roles_building_code_unique_idx
  on public.customer_roles(building_id, code)
  where building_id is not null;

create unique index if not exists customer_roles_global_code_unique_idx
  on public.customer_roles(code)
  where building_id is null;

create table if not exists public.auth_location_events (
  id bigint generated always as identity primary key,
  source text not null check (source in ('erp', 'customer')),
  user_id bigint not null,
  role text not null default '',
  event_type text not null check (event_type in ('login', 'logout')),
  occurred_at timestamptz not null default now(),
  captured_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  altitude double precision,
  altitude_accuracy_meters double precision,
  heading double precision,
  speed double precision,
  location jsonb,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists auth_location_events_user_idx
  on public.auth_location_events(source, user_id, occurred_at desc);

create index if not exists auth_location_events_event_type_idx
  on public.auth_location_events(event_type, occurred_at desc);

-- ============================================================================
-- Chats and Telegram
-- Used by /api/chats and /api/telegram.
-- ============================================================================

create table if not exists public.chats (
  id bigint generated always as identity primary key,
  title text not null,
  is_group boolean not null default true,
  tg_chat_id bigint,
  tg_type text,
  object_id bigint references public.objects(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chats_tg_chat_id_idx
  on public.chats(tg_chat_id);

create index if not exists chats_object_id_idx
  on public.chats(object_id);

create table if not exists public.chat_members (
  chat_id bigint not null references public.chats(id),
  user_id uuid not null,
  role text not null default 'member',
  object_id bigint references public.objects(id),
  tg_user_id bigint,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index if not exists chat_members_object_id_idx
  on public.chat_members(object_id);

create index if not exists chat_members_tg_user_id_idx
  on public.chat_members(tg_user_id);

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  chat_id bigint not null references public.chats(id),
  author_id text not null,
  content text not null,
  object_id bigint references public.objects(id),
  external_id bigint,
  direction text not null default 'in' check (direction in ('in', 'out')),
  status text not null default 'sent' check (status in ('sent', 'delivered', 'error')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists chat_messages_chat_id_idx
  on public.chat_messages(chat_id, created_at);

create index if not exists chat_messages_object_id_idx
  on public.chat_messages(object_id);

create index if not exists chat_messages_external_id_idx
  on public.chat_messages(external_id);

create table if not exists public.telegram_group_bindings (
  id bigint generated always as identity primary key,
  tg_chat_id bigint not null,
  object_id bigint not null references public.objects(id),
  title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_group_bindings_tg_chat_id_unique_idx
  on public.telegram_group_bindings(tg_chat_id);

create index if not exists telegram_group_bindings_object_id_idx
  on public.telegram_group_bindings(object_id);

-- ============================================================================
-- Warehouse and expenses
-- Used by /api/warehouse and /api/expenses.
-- ============================================================================

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
  on public.warehouse_items(lower(name), lower(manufacturer), calculation_type);

create index if not exists warehouse_items_active_idx
  on public.warehouse_items(is_active);

create index if not exists warehouse_items_calculation_type_idx
  on public.warehouse_items(calculation_type);

create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id),
  warehouse_item_id bigint references public.warehouse_items(id),
  quantity numeric(12, 3),
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

create index if not exists expenses_object_id_idx
  on public.expenses(object_id);

create index if not exists expenses_warehouse_item_id_idx
  on public.expenses(warehouse_item_id);

create index if not exists expenses_status_idx
  on public.expenses(status);

create index if not exists expenses_due_date_idx
  on public.expenses(due_date);

-- ============================================================================
-- Documents and signatures
-- Used by /api/documents and mobile document signing endpoints.
-- ============================================================================

create table if not exists public.document_templates (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id),
  name text not null,
  description text,
  contract_type text not null default 'gph',
  html text not null default '',
  css text not null default '',
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_templates_object_id_idx
  on public.document_templates(object_id);

create table if not exists public.document_dispatches (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id),
  template_id bigint references public.document_templates(id),
  title text not null,
  recipient_ids bigint[] not null default '{}',
  recipient_phones text[] not null default '{}',
  recipient_count integer not null default 0,
  signed_count integer not null default 0,
  status text not null default 'sent' check (status in ('sent', 'partially_signed', 'signed')),
  sent_at timestamptz not null default now()
);

create index if not exists document_dispatches_template_id_idx
  on public.document_dispatches(template_id);

create index if not exists document_dispatches_object_id_idx
  on public.document_dispatches(object_id);

create table if not exists public.signed_documents (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id),
  dispatch_id bigint references public.document_dispatches(id),
  template_id bigint references public.document_templates(id),
  employee_name text not null,
  phone_number text not null,
  signed_at timestamptz not null default now(),
  signed_via text not null default 'mobile',
  file_url text,
  signature_path text,
  signature_json jsonb,
  consent_checked boolean not null default false,
  user_agent text
);

create index if not exists signed_documents_template_id_idx
  on public.signed_documents(template_id);

create index if not exists signed_documents_object_id_idx
  on public.signed_documents(object_id);

create index if not exists signed_documents_phone_number_idx
  on public.signed_documents(phone_number);

create index if not exists signed_documents_signature_path_idx
  on public.signed_documents(signature_path);

-- ============================================================================
-- Employee activity, advances, locations and tasks
-- Used by employee activity, mobile activity, object task and HR salary APIs.
-- ============================================================================

create table if not exists public.employee_activity (
  id bigint generated always as identity primary key,
  employee_id bigint references public.customers(id),
  employee_name text,
  activity_date date not null,
  status text not null default 'on_time' check (status in ('on_time', 'late', 'absent')),
  work_minutes integer not null default 0 check (work_minutes >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  started_location jsonb,
  finished_location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employee_activity_employee_date_unique_idx
  on public.employee_activity(employee_id, activity_date)
  where employee_id is not null;

create index if not exists employee_activity_employee_idx
  on public.employee_activity(employee_id, activity_date desc);

create index if not exists employee_activity_date_idx
  on public.employee_activity(activity_date desc);

create index if not exists employee_activity_status_idx
  on public.employee_activity(status);

create table if not exists public.employee_advances (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id),
  object_id bigint references public.objects(id),
  building_id bigint references public.buildings(id),
  amount bigint not null default 0 check (amount >= 0),
  currency text not null default 'UZS',
  comment text,
  status public.advance_status not null default 'issued',
  issued_by text,
  issued_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists employee_advances_customer_idx
  on public.employee_advances(customer_id);

create index if not exists employee_advances_status_idx
  on public.employee_advances(status, issued_at);

create index if not exists employee_advances_object_idx
  on public.employee_advances(object_id);

create table if not exists public.employee_location_points (
  id bigint generated always as identity primary key,
  employee_id bigint not null references public.customers(id),
  activity_id bigint references public.employee_activity(id),
  building_id bigint references public.buildings(id),
  recorded_at timestamptz not null default now(),
  captured_at timestamptz,
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  accuracy_meters double precision,
  altitude double precision,
  altitude_accuracy_meters double precision,
  heading double precision,
  speed double precision,
  source text not null default 'mobile' check (source in ('mobile')),
  location jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employee_location_points_employee_idx
  on public.employee_location_points(employee_id, recorded_at desc);

create index if not exists employee_location_points_activity_idx
  on public.employee_location_points(activity_id, recorded_at asc);

create index if not exists employee_location_points_building_idx
  on public.employee_location_points(building_id, recorded_at desc);

create table if not exists public.object_task_lists (
  id bigint generated always as identity primary key,
  object_id bigint not null references public.objects(id),
  employee_id bigint references public.customers(id),
  group_id uuid,
  title text not null,
  note text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed')),
  review_status text not null default 'none' check (review_status in ('none', 'pending', 'approved', 'rejected')),
  reviewer_id bigint references public.customers(id),
  review_requested_at timestamptz,
  reviewed_at timestamptz,
  review_comment text,
  review_photo_path text,
  created_by_id bigint,
  created_by_name text,
  created_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint object_task_lists_group_employee_unique unique (group_id, employee_id)
);

create index if not exists object_task_lists_object_id_idx
  on public.object_task_lists(object_id);

create index if not exists object_task_lists_employee_id_idx
  on public.object_task_lists(employee_id);

create index if not exists object_task_lists_group_id_idx
  on public.object_task_lists(group_id);

create index if not exists object_task_lists_status_idx
  on public.object_task_lists(status);

create index if not exists object_task_lists_due_date_idx
  on public.object_task_lists(due_date);

create index if not exists object_task_lists_review_status_idx
  on public.object_task_lists(review_status);

create index if not exists object_task_lists_reviewer_id_idx
  on public.object_task_lists(reviewer_id);

create index if not exists object_task_lists_review_requested_at_idx
  on public.object_task_lists(review_requested_at);

create index if not exists object_task_lists_review_photo_path_idx
  on public.object_task_lists(review_photo_path);

create table if not exists public.object_task_items (
  id bigint generated always as identity primary key,
  task_list_id bigint not null references public.object_task_lists(id),
  title text not null,
  is_done boolean not null default false,
  completed_at timestamptz,
  proof_photo_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists object_task_items_task_list_id_idx
  on public.object_task_items(task_list_id);

create index if not exists object_task_items_is_done_idx
  on public.object_task_items(is_done);

create index if not exists object_task_items_proof_photo_path_idx
  on public.object_task_items(proof_photo_path);

-- ============================================================================
-- Operational reports: aroma, marble, sanitation and waste
-- Used by /api/reports, /api/waste and mobile report endpoints.
-- ============================================================================

create table if not exists public.aroma_devices (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id),
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

create index if not exists aroma_devices_object_idx
  on public.aroma_devices(object_id);

create table if not exists public.aroma_refills (
  id bigint generated always as identity primary key,
  device_id bigint not null references public.aroma_devices(id),
  object_id bigint references public.objects(id),
  amount_ml integer not null default 0 check (amount_ml >= 0),
  price numeric not null default 0,
  refilled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists aroma_refills_device_idx
  on public.aroma_refills(device_id);

create index if not exists aroma_refills_object_idx
  on public.aroma_refills(object_id);

create table if not exists public.marble_events (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id),
  type text not null check (type in ('crystallization', 'polishing')),
  performed_at timestamptz not null default now(),
  team text not null,
  executors text[] not null default '{}',
  area_m2 numeric not null default 0,
  notes text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marble_events_object_idx
  on public.marble_events(object_id);

create index if not exists marble_events_type_idx
  on public.marble_events(type);

create index if not exists marble_events_date_idx
  on public.marble_events(performed_at desc);

create table if not exists public.sanitation_events (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id),
  type text not null check (type in ('disinfection', 'deratization')),
  performed_at timestamptz not null default now(),
  team text not null,
  executors text[] not null default '{}',
  notes text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sanitation_events_object_idx
  on public.sanitation_events(object_id);

create index if not exists sanitation_events_type_idx
  on public.sanitation_events(type);

create index if not exists sanitation_events_performed_idx
  on public.sanitation_events(performed_at desc);

create table if not exists public.waste_bins (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id),
  category text not null check (category in ('Макулатура', 'Пластик', 'Общее')),
  volume_m3 numeric not null default 0,
  weight_kg numeric not null default 0,
  status text not null default 'available' check (status in ('available', 'loaded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists waste_bins_object_idx
  on public.waste_bins(object_id);

create table if not exists public.waste_reports (
  id bigint generated always as identity primary key,
  bin_id bigint not null references public.waste_bins(id),
  object_id bigint references public.objects(id),
  category text not null check (category in ('Макулатура', 'Пластик', 'Общее')),
  amount_m3 numeric not null default 0,
  amount_kg numeric not null default 0,
  direction text not null default 'out' check (direction in ('in', 'out')),
  from_object_id bigint references public.objects(id),
  to_object_id bigint references public.objects(id),
  vehicle text,
  photo_url text,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists waste_reports_bin_id_idx
  on public.waste_reports(bin_id);

create index if not exists waste_reports_object_idx
  on public.waste_reports(object_id);

create index if not exists waste_reports_created_idx
  on public.waste_reports(created_at desc);

create index if not exists waste_reports_direction_idx
  on public.waste_reports(direction);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_erp_users_updated') then
    create trigger trg_erp_users_updated before update on public.erp_users
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_chats_updated') then
    create trigger trg_chats_updated before update on public.chats
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_telegram_group_bindings_updated') then
    create trigger trg_telegram_group_bindings_updated before update on public.telegram_group_bindings
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_warehouse_items_updated') then
    create trigger trg_warehouse_items_updated before update on public.warehouse_items
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_expenses_updated') then
    create trigger trg_expenses_updated before update on public.expenses
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_document_templates_updated') then
    create trigger trg_document_templates_updated before update on public.document_templates
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_employee_activity_updated') then
    create trigger trg_employee_activity_updated before update on public.employee_activity
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_object_task_lists_updated') then
    create trigger trg_object_task_lists_updated before update on public.object_task_lists
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_object_task_items_updated') then
    create trigger trg_object_task_items_updated before update on public.object_task_items
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_aroma_devices_updated') then
    create trigger trg_aroma_devices_updated before update on public.aroma_devices
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_marble_events_updated') then
    create trigger trg_marble_events_updated before update on public.marble_events
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_sanitation_events_updated') then
    create trigger trg_sanitation_events_updated before update on public.sanitation_events
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_waste_bins_updated') then
    create trigger trg_waste_bins_updated before update on public.waste_bins
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- ============================================================================
-- app_user ownership and privileges
-- This block is skipped when role app_user does not exist yet.
-- ============================================================================

do $$
declare
  item record;
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'grant usage, create on schema public to app_user';

    for item in
      select format('%I.%I', n.nspname, c.relname) as qualified_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
    loop
      execute format('alter table %s owner to app_user', item.qualified_name);
    end loop;

    for item in
      select format('%I.%I', n.nspname, c.relname) as qualified_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'S'
    loop
      execute format('alter sequence %s owner to app_user', item.qualified_name);
    end loop;

    execute 'grant all privileges on all tables in schema public to app_user';
    execute 'grant all privileges on all sequences in schema public to app_user';
  end if;
end $$;

-- ============================================================================
-- Verification SQL, keep commented and run manually after applying the schema.
-- ============================================================================

-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
-- order by table_name;

-- select column_name, data_type, udt_name, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'objects'
--   and column_name in ('is_active', 'schedule_type')
-- order by column_name;

-- select to_regclass('public.erp_users') as erp_users_table,
--        to_regclass('public.customers') as customers_table,
--        to_regclass('public.auth_location_events') as auth_location_events_table;

-- select schemaname, tablename, indexname
-- from pg_indexes
-- where schemaname = 'public'
-- order by tablename, indexname;

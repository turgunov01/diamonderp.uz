-- Postgres SQL: documents, dispatches and signatures

create table if not exists public.document_templates (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete restrict,
  name text not null,
  description text,
  contract_type text not null default 'gph',
  html text not null default '',
  css text not null default '',
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_dispatches (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete restrict,
  template_id bigint references public.document_templates(id) on delete set null,
  title text not null,
  recipient_ids bigint[] not null default '{}',
  recipient_phones text[] not null default '{}',
  recipient_count integer not null default 0,
  signed_count integer not null default 0,
  status text not null default 'sent' check (status in ('sent', 'partially_signed', 'signed')),
  sent_at timestamptz not null default now()
);

create table if not exists public.signed_documents (
  id bigint generated always as identity primary key,
  object_id bigint references public.objects(id) on delete restrict,
  dispatch_id bigint references public.document_dispatches(id) on delete set null,
  template_id bigint references public.document_templates(id) on delete set null,
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

-- Safe alters for existing deployments
alter table public.signed_documents
  add column if not exists signature_path text,
  add column if not exists signature_json jsonb,
  add column if not exists consent_checked boolean not null default false,
  add column if not exists user_agent text;

-- Safe upserts for existing deployments
alter table public.signed_documents
  add column if not exists signature_path text,
  add column if not exists signature_json jsonb,
  add column if not exists consent_checked boolean not null default false,
  add column if not exists user_agent text;

alter table public.document_dispatches
  alter column status drop default,
  alter column status type text using status::text,
  alter column status set default 'sent';

create index if not exists document_templates_object_id_idx on public.document_templates(object_id);
create index if not exists document_dispatches_template_id_idx on public.document_dispatches(template_id);
create index if not exists document_dispatches_object_id_idx on public.document_dispatches(object_id);
create index if not exists signed_documents_template_id_idx on public.signed_documents(template_id);
create index if not exists signed_documents_object_id_idx on public.signed_documents(object_id);
create index if not exists signed_documents_phone_number_idx on public.signed_documents(phone_number);
create index if not exists signed_documents_signature_path_idx on public.signed_documents(signature_path);

alter table public.document_templates enable row level security;
alter table public.document_dispatches enable row level security;
alter table public.signed_documents enable row level security;

drop policy if exists "Allow read document_templates" on public.document_templates;
create policy "Allow read document_templates"
on public.document_templates
for select
to authenticated
using (true);

drop policy if exists "Allow insert document_templates" on public.document_templates;
create policy "Allow insert document_templates"
on public.document_templates
for insert
to authenticated
with check (true);

drop policy if exists "Allow update document_templates" on public.document_templates;
create policy "Allow update document_templates"
on public.document_templates
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow read document_dispatches" on public.document_dispatches;
create policy "Allow read document_dispatches"
on public.document_dispatches
for select
to authenticated
using (true);

drop policy if exists "Allow insert document_dispatches" on public.document_dispatches;
create policy "Allow insert document_dispatches"
on public.document_dispatches
for insert
to authenticated
with check (true);

drop policy if exists "Allow update document_dispatches" on public.document_dispatches;
create policy "Allow update document_dispatches"
on public.document_dispatches
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow read signed_documents" on public.signed_documents;
create policy "Allow read signed_documents"
on public.signed_documents
for select
to authenticated
using (true);

drop policy if exists "Allow insert signed_documents" on public.signed_documents;
create policy "Allow insert signed_documents"
on public.signed_documents
for insert
to authenticated
with check (true);

drop policy if exists "Allow update signed_documents" on public.signed_documents;
create policy "Allow update signed_documents"
on public.signed_documents
for update
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('document-templates', 'document-templates', false)
on conflict (id) do update
set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('document-signatures', 'document-signatures', false)
on conflict (id) do update
set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('document-template-uploads', 'document-template-uploads', false)
on conflict (id) do update
set public = excluded.public;

insert into public.document_templates (name, description, contract_type, html, css, storage_path)
values
  ('ГПХ базовый', 'Шаблон для ГПХ договора', 'gph', '<section><h1>Договор ГПХ</h1><p>{{employee_name}}</p></section>', '', 'seed/gph-template.json'),
  ('NDA сотрудника', 'Соглашение о неразглашении', 'nda', '<section><h1>NDA</h1><p>{{employee_name}}</p></section>', '', 'seed/nda-template.json')
on conflict do nothing;

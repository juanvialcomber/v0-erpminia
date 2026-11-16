-- MOTIL Ingeniería y Proyectos: intake de borradores, sin aprobación ni publicación de cartera.
create table if not exists public.engineering_project_intake_v1 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  project_name text not null check (length(btrim(project_name)) between 2 and 160),
  requesting_area text not null check (length(btrim(requesting_area)) between 2 and 100),
  need_summary text not null check (length(btrim(need_summary)) between 2 and 2500),
  objective text check (objective is null or length(objective) <= 1500),
  location text check (location is null or length(location) <= 200),
  target_date date,
  source_reference text check (source_reference is null or length(source_reference) <= 1000),
  status text not null default 'draft' check (status = 'draft'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists engineering_project_intake_v1_org_updated_idx
  on public.engineering_project_intake_v1 (organization_id, updated_at desc);

alter table public.engineering_project_intake_v1 enable row level security;
revoke all on public.engineering_project_intake_v1 from public, anon, authenticated;
grant select, insert, update on public.engineering_project_intake_v1 to service_role;

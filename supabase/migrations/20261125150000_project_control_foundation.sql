-- Shared project-control foundation. No source record is changed.
create table public.project_control_budget_versions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 fiscal_year integer not null check (fiscal_year between 2027 and 2100),
 version integer not null check (version > 0),
 status text not null default 'draft' check (status in ('draft','approved','superseded')),
 source_reference text not null check (length(btrim(source_reference))>0),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 approved_by uuid references public.profiles(id),
 approved_at timestamptz,
 unique(organization_id,fiscal_year,version),
 unique(organization_id,id),
 check ((status='draft' and approved_by is null and approved_at is null) or (status in ('approved','superseded') and approved_by is not null and approved_at is not null))
);
create unique index project_control_one_approved_budget on public.project_control_budget_versions(organization_id,fiscal_year) where status='approved';
create table public.project_control_budget_lines (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 budget_version_id uuid not null,
 cost_center_id uuid not null references canonical.cost_centers(id),
 annual_amount_clp numeric(20,0) not null check(annual_amount_clp>=0),
 source_reference text not null check(length(btrim(source_reference))>0),
 foreign key(organization_id,budget_version_id) references public.project_control_budget_versions(organization_id,id),
 unique(budget_version_id,cost_center_id)
);
create table public.project_control_allocations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.engineering_project_intake_v1(id),
 budget_line_id uuid not null references public.project_control_budget_lines(id),
 allocated_clp numeric(20,0) not null check(allocated_clp>=0),
 source_reference text not null check(length(btrim(source_reference))>0),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(project_id,budget_line_id)
);
create table public.project_control_contract_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.engineering_project_intake_v1(id),
 contract_id uuid not null references public.contracts(id),
 source_reference text not null check(length(btrim(source_reference))>0),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(organization_id,contract_id)
);
create table public.project_control_progress (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.engineering_project_intake_v1(id),
 observed_on date not null,
 physical_progress_pct numeric(5,2) not null check(physical_progress_pct between 0 and 100),
 source_reference text not null check(length(btrim(source_reference))>0),
 recorded_by uuid not null references public.profiles(id),
 recorded_at timestamptz not null default now()
);
create table public.project_control_monthly_closes (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 period_start date not null check(extract(day from period_start)=1 and period_start >= date '2027-01-01'),
 revision integer not null default 1 check(revision>0),
 status text not null default 'draft' check(status in ('draft','review','closed')),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(organization_id,period_start,revision),
 unique(organization_id,id)
);
create table public.project_control_close_reviews (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 close_id uuid not null,
 area text not null check(area in ('engineering','legal','finance')),
 reviewer_id uuid not null references public.profiles(id),
 decision text not null check(decision in ('accepted','returned')),
 evidence_reference text not null check(length(btrim(evidence_reference))>0),
 reviewed_at timestamptz not null default now(),
 foreign key(organization_id,close_id) references public.project_control_monthly_closes(organization_id,id)
);
-- Fail closed at the database boundary. No browser role receives direct access.
do $$
declare t text;
begin
 foreach t in array array['project_control_budget_versions','project_control_budget_lines','project_control_allocations','project_control_contract_links','project_control_progress','project_control_monthly_closes','project_control_close_reviews']
 loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant select on public.%I to service_role',t);
 end loop;
end $$;
-- Validate cross-tenant references independently of application checks.
create function public.project_control_validate_scope() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name in ('project_control_allocations','project_control_contract_links','project_control_progress') then
   if not exists(select 1 from public.engineering_project_intake_v1 p where p.id=new.project_id and p.organization_id=new.organization_id) then raise exception 'Project scope mismatch'; end if;
 end if;
 if tg_table_name='project_control_budget_lines' then
   if not exists(select 1 from canonical.cost_centers c where c.id=new.cost_center_id and c.organization_id=new.organization_id) then raise exception 'Cost center scope mismatch'; end if;
 elsif tg_table_name='project_control_allocations' then
   if not exists(select 1 from public.project_control_budget_lines l where l.id=new.budget_line_id and l.organization_id=new.organization_id) then raise exception 'Budget line scope mismatch'; end if;
 elsif tg_table_name='project_control_contract_links' then
   if not exists(select 1 from public.contracts c where c.id=new.contract_id and c.organization_id=new.organization_id) then raise exception 'Contract scope mismatch'; end if;
 end if;
 return new;
end $$;
revoke all on function public.project_control_validate_scope() from public, anon, authenticated;
do $$
declare t text;
begin
 foreach t in array array['project_control_budget_lines','project_control_allocations','project_control_contract_links','project_control_progress']
 loop
 execute format('create trigger project_control_scope before insert or update on public.%I for each row execute function public.project_control_validate_scope()',t);
 end loop;
end $$;

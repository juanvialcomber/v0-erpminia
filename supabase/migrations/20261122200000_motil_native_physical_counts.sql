-- MOTIL-native physical counts for Central (002).
-- This workflow is independent from Laudus and records evidence only.
-- An approved count is an opening-balance candidate; it does not mutate stock.
create table if not exists public.bodega_motil_stock_counts_v1 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  warehouse_id uuid not null references public.warehouses(id),
  canonical_product_id uuid not null references canonical.products(id),
  product_code text not null,
  product_name text not null,
  unit_of_measure text not null,
  counted_quantity numeric(20,6) not null check (counted_quantity >= 0),
  counted_by uuid not null references public.profiles(id),
  counted_at timestamptz not null default now(),
  note text,
  evidence_reference text,
  request_id uuid not null,
  unique (organization_id, request_id),
  constraint bodega_motil_count_text_limits check (
    length(coalesce(note, '')) <= 1000
    and length(coalesce(evidence_reference, '')) <= 500
  )
);

create index if not exists idx_bodega_motil_stock_counts_queue
  on public.bodega_motil_stock_counts_v1
  (organization_id, warehouse_id, counted_at desc, id desc);

create table if not exists public.bodega_motil_stock_count_reviews_v1 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  count_id uuid not null references public.bodega_motil_stock_counts_v1(id),
  decision text not null check (decision in ('approved_for_opening', 'recount_required')),
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  review_note text,
  unique (organization_id, count_id),
  constraint bodega_motil_count_review_note_limit check (length(coalesce(review_note, '')) <= 1000)
);

create or replace function public.validate_bodega_motil_stock_count_v1()
returns trigger
language plpgsql
security definer
set search_path = public, canonical, pg_temp
as $$
begin
  if not exists (
    select 1 from public.warehouses w
    where w.id = new.warehouse_id
      and w.organization_id = new.organization_id
      and w.code = '002'
  ) then
    raise exception 'El conteo MOTIL está limitado a Bodega Central (002) en este piloto';
  end if;

  if not exists (
    select 1 from canonical.products p
    where p.id = new.canonical_product_id
      and p.organization_id = new.organization_id
      and p.is_active is true
      and p.validation_status = 'valid'
      and nullif(btrim(p.product_code), '') is not null
      and nullif(btrim(p.unit), '') is not null
      and upper(btrim(p.product_code)) = upper(btrim(new.product_code))
      and lower(btrim(p.unit)) = lower(btrim(new.unit_of_measure))
  ) then
    raise exception 'Producto, código o unidad MOTIL no está validado para inventario';
  end if;

  if not exists (
    select 1 from public.bodega_stock_verifier_assignments a
    where a.organization_id = new.organization_id
      and a.warehouse_id = new.warehouse_id
      and a.profile_id = new.counted_by
      and a.is_active is true
      and (a.expires_at is null or a.expires_at > now())
  ) then
    raise exception 'El responsable no tiene asignación vigente para esta bodega';
  end if;

  return new;
end;
$$;

create or replace function public.validate_bodega_motil_stock_count_review_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count public.bodega_motil_stock_counts_v1%rowtype;
begin
  select * into v_count
  from public.bodega_motil_stock_counts_v1 c
  where c.id = new.count_id
    and c.organization_id = new.organization_id;

  if not found then
    raise exception 'Conteo MOTIL no encontrado en la organización';
  end if;

  if v_count.counted_by = new.reviewed_by then
    raise exception 'Una segunda persona asignada debe revisar el conteo';
  end if;

  if not exists (
    select 1 from public.bodega_stock_verifier_assignments a
    where a.organization_id = new.organization_id
      and a.warehouse_id = v_count.warehouse_id
      and a.profile_id = new.reviewed_by
      and a.is_active is true
      and (a.expires_at is null or a.expires_at > now())
  ) then
    raise exception 'El revisor no tiene asignación vigente para esta bodega';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_bodega_count_history_mutation_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'El historial de conteos MOTIL es inmutable; registra un nuevo conteo o revisión';
end;
$$;

drop trigger if exists bodega_motil_stock_count_validate_v1
  on public.bodega_motil_stock_counts_v1;
create trigger bodega_motil_stock_count_validate_v1
before insert on public.bodega_motil_stock_counts_v1
for each row execute function public.validate_bodega_motil_stock_count_v1();

drop trigger if exists bodega_motil_stock_count_review_validate_v1
  on public.bodega_motil_stock_count_reviews_v1;
create trigger bodega_motil_stock_count_review_validate_v1
before insert on public.bodega_motil_stock_count_reviews_v1
for each row execute function public.validate_bodega_motil_stock_count_review_v1();

drop trigger if exists bodega_motil_stock_count_immutable_v1
  on public.bodega_motil_stock_counts_v1;
create trigger bodega_motil_stock_count_immutable_v1
before update or delete on public.bodega_motil_stock_counts_v1
for each row execute function public.prevent_bodega_count_history_mutation_v1();

drop trigger if exists bodega_motil_stock_count_review_immutable_v1
  on public.bodega_motil_stock_count_reviews_v1;
create trigger bodega_motil_stock_count_review_immutable_v1
before update or delete on public.bodega_motil_stock_count_reviews_v1
for each row execute function public.prevent_bodega_count_history_mutation_v1();

create or replace view public.bodega_motil_stock_count_catalog_v1
with (security_invoker = true)
as
select
  p.organization_id,
  p.id as canonical_product_id,
  p.product_code,
  p.name as product_name,
  p.description,
  p.unit as unit_of_measure
from canonical.products p
where p.is_active is true
  and p.validation_status = 'valid'
  and nullif(btrim(p.product_code), '') is not null
  and nullif(btrim(p.unit), '') is not null;

create or replace view public.bodega_motil_stock_count_queue_v1
with (security_invoker = true)
as
select
  c.id,
  c.organization_id,
  c.warehouse_id,
  c.canonical_product_id,
  c.product_code,
  c.product_name,
  c.unit_of_measure,
  c.counted_quantity,
  c.counted_by,
  c.counted_at,
  c.note,
  c.evidence_reference,
  r.decision,
  r.reviewed_by,
  r.reviewed_at,
  r.review_note
from public.bodega_motil_stock_counts_v1 c
left join public.bodega_motil_stock_count_reviews_v1 r
  on r.organization_id = c.organization_id
 and r.count_id = c.id;

alter table public.bodega_motil_stock_counts_v1 enable row level security;
alter table public.bodega_motil_stock_count_reviews_v1 enable row level security;
revoke all on public.bodega_motil_stock_counts_v1 from public, anon, authenticated, service_role;
revoke all on public.bodega_motil_stock_count_reviews_v1 from public, anon, authenticated, service_role;
grant select, insert on public.bodega_motil_stock_counts_v1 to service_role;
grant select, insert on public.bodega_motil_stock_count_reviews_v1 to service_role;
revoke all on public.bodega_motil_stock_count_catalog_v1 from public, anon, authenticated;
revoke all on public.bodega_motil_stock_count_queue_v1 from public, anon, authenticated;
grant select on public.bodega_motil_stock_count_catalog_v1 to service_role;
grant select on public.bodega_motil_stock_count_queue_v1 to service_role;
revoke all on function public.validate_bodega_motil_stock_count_v1() from public, anon, authenticated;
revoke all on function public.validate_bodega_motil_stock_count_review_v1() from public, anon, authenticated;
revoke all on function public.prevent_bodega_count_history_mutation_v1() from public, anon, authenticated;

comment on table public.bodega_motil_stock_counts_v1 is
  'MOTIL-native physical count evidence for Central (002). Independent of Laudus; append-only; no stock mutation.';
comment on table public.bodega_motil_stock_count_reviews_v1 is
  'Second-person review of MOTIL physical counts. approved_for_opening means candidate only; it does not change available stock.';
comment on view public.bodega_motil_stock_count_catalog_v1 is
  'Server-only MOTIL catalog restricted to active, valid products with a confirmed unit of measure.';
comment on view public.bodega_motil_stock_count_queue_v1 is
  'Server-only MOTIL physical count history with second-person review; no Laudus values and no stock adjustment.';

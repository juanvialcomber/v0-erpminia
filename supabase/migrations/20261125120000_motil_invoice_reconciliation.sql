-- Read-only document comparison. No approval, transfer, or source mutation.
create or replace function public.motil_invoice_reconciliation_v1(
  p_organization_id uuid, p_status text default null, p_offset integer default 0, p_limit integer default 50
) returns jsonb language sql stable security definer set search_path = '' as $$
with laudus_base as (
  select p.purchase_invoice_external_id as laudus_id, trim(p.doc_number) as folio,
    regexp_replace(upper(trim(i.supplier_tax_id)), '[. -]', '', 'g') as rut,
    p.supplier_name, nullif(upper(trim(p.currency)), '') as currency,
    p.total_amount, p.paid_amount, p.outstanding_amount, p.due_date::date as due_date,
    p.payment_status, i.synced_at
  from public.laudus_purchase_invoice_payment_status_service_v1 p
  join integration.laudus_purchase_invoices i on i.organization_id=p.organization_id
    and i.external_id=p.purchase_invoice_external_id
  where p.organization_id=p_organization_id
), laudus as (
  select *, count(*) over(partition by rut,folio) as key_count
  from laudus_base
), motil_base as (
  select i.id as motil_invoice_id, trim(i.invoice_number) as folio,
    regexp_replace(upper(trim(s.rut)), '[. -]', '', 'g') as rut,
    s.name as supplier_name, nullif(upper(trim(i.currency)), '') as currency,
    i.total_amount, ap.id as payable_id, ap.approved_amount, ap.paid_amount,
    ap.outstanding_amount, ap.due_date, i.status as invoice_status
  from public.procurement_supplier_invoices i
  left join public.suppliers s on s.id=i.supplier_id and s.organization_id=i.organization_id
  left join public.procurement_accounts_payable_v1 ap on ap.invoice_id=i.id and ap.organization_id=i.organization_id
  where i.organization_id=p_organization_id
    and coalesce(i.invoice_number,'') not ilike 'UAT-%'
    and coalesce(s.name,'') not ilike 'UAT-%'
), motil as (
  select *, count(*) over(partition by rut,folio) as key_count
  from motil_base
), joined as (
  select l.laudus_id, m.motil_invoice_id, m.payable_id, coalesce(l.folio,m.folio) as folio,
    coalesce(l.rut,m.rut) as rut, coalesce(l.supplier_name,m.supplier_name) as supplier_name,
    l.currency as laudus_currency, m.currency as motil_currency,
    l.total_amount as laudus_total, m.total_amount as motil_total,
    l.paid_amount as laudus_paid, m.paid_amount as motil_paid,
    l.outstanding_amount as laudus_balance, m.outstanding_amount as motil_balance,
    l.due_date as laudus_due_date, m.due_date as motil_due_date,
    l.synced_at as laudus_synced_at, l.payment_status, m.invoice_status,
    case
      when coalesce(l.rut,m.rut,'') !~ '^[0-9]{7,8}[0-9K]$' or coalesce(l.folio,m.folio,'')='' then 'identity_missing'
      when coalesce(l.key_count,0)>1 or coalesce(m.key_count,0)>1 then 'ambiguous'
      when l.laudus_id is not null and l.currency is null or m.motil_invoice_id is not null and m.currency is null then 'currency_missing'
      when m.motil_invoice_id is null then 'laudus_only'
      when l.laudus_id is null then 'motil_only'
      when l.currency is distinct from m.currency or l.total_amount is distinct from m.total_amount then 'invoice_difference'
      when m.payable_id is null then 'approval_missing'
      when l.outstanding_amount is distinct from m.outstanding_amount or l.paid_amount is distinct from m.paid_amount then 'payment_difference'
      else 'candidate_consistent'
    end as review_status
  from laudus l full outer join motil m on l.rut=m.rut and l.folio=m.folio
    and l.rut ~ '^[0-9]{7,8}[0-9K]$' and l.folio<>''
    and l.key_count=1 and m.key_count=1
  where (l.payment_status in ('unpaid','partially_paid') and l.outstanding_amount>0)
     or (m.motil_invoice_id is not null and (m.payable_id is null or m.outstanding_amount>0))
), classified as (
  select j.*, case
    when j.review_status in ('laudus_only','motil_only','currency_missing') and
      exists (select 1 from laudus l where l.rut=j.rut and l.folio=j.folio and l.key_count>1)
      then 'ambiguous'
    when j.review_status in ('laudus_only','motil_only','currency_missing') and
      exists (select 1 from motil m where m.rut=j.rut and m.folio=j.folio and m.key_count>1)
      then 'ambiguous'
    else j.review_status end as status
  from joined j
)
select jsonb_build_object(
  'summary', (select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status,count(*) as n from classified group by status) s),
  'total', (select count(*) from classified where p_status is null or status=p_status),
  'rows', (select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (
    select laudus_id,motil_invoice_id,payable_id,folio,rut,supplier_name,laudus_currency,motil_currency,
      laudus_total,motil_total,laudus_paid,motil_paid,laudus_balance,motil_balance,laudus_due_date,motil_due_date,
      laudus_synced_at,payment_status,invoice_status,status
    from classified where p_status is null or status=p_status
    order by case status when 'invoice_difference' then 0 when 'payment_difference' then 1 when 'ambiguous' then 2 when 'approval_missing' then 3 else 4 end,
      laudus_due_date nulls last, motil_due_date nulls last, laudus_id nulls last,motil_invoice_id nulls last
    offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,50),1),100)
  ) q)
);
$$;
revoke all on function public.motil_invoice_reconciliation_v1(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.motil_invoice_reconciliation_v1(uuid,text,integer,integer) to service_role;

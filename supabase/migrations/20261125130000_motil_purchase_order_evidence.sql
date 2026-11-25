-- Read-only evidence classification. Never promotes an order or creates a payable.
create or replace function public.motil_purchase_order_evidence_v1(
  p_organization_id uuid, p_status text default null, p_offset integer default 0, p_limit integer default 50
) returns jsonb
language sql stable security definer set search_path = ''
as $$
with lines as (
  select purchase_order_external_id,
    count(*) as line_count,
    count(*) filter (where line_total is null or quantity is null or unit_price is null) as incomplete_lines,
    count(*) filter (where line_total < 0 or quantity < 0 or unit_price < 0 or abs(line_total - quantity * unit_price) > 0.01) as conflicting_lines,
    count(*) filter (where line_total = 0) as zero_lines,
    count(*) - count(distinct line_external_key) as duplicate_or_missing_keys,
    sum(line_total) as line_amount
  from integration.laudus_purchase_order_lines
  where organization_id = p_organization_id
  group by purchase_order_external_id
), evidence as (
  select o.external_id, o.order_number, o.supplier_name, o.issued_date, o.due_date,
    o.status as source_status, o.reconciliation_status, o.synced_at,
    nullif(upper(btrim(o.currency)), '') as currency,
    o.total_amount as source_total, l.line_amount as reconstructed_line_amount,
    coalesce(l.line_count, 0) as line_count,
    coalesce(l.zero_lines, 0) as zero_lines,
    o.canonical_purchase_order_id is not null as has_canonical_link,
    nullif(btrim(o.supplier_tax_id), '') is not null as has_supplier_rut,
    case when l.line_count is null then 'missing_lines'
      when l.incomplete_lines > 0 or l.conflicting_lines > 0 or l.duplicate_or_missing_keys > 0 then 'line_conflict'
      when o.currency is null or upper(btrim(o.currency)) !~ '^[A-Z]{3}$' then 'currency_missing'
      when nullif(btrim(o.supplier_tax_id), '') is null then 'supplier_identity_missing'
      when o.total_amount is null then 'header_total_missing'
      when o.canonical_purchase_order_id is null then 'unlinked'
      else 'review_required'
    end as evidence_status
  from integration.laudus_purchase_orders o
  left join lines l on l.purchase_order_external_id = o.external_id
  where o.organization_id = p_organization_id
), filtered as (
  select * from evidence where p_status is null or evidence_status = p_status
), page as (
  select * from filtered order by issued_date desc nulls last, external_id
  offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,50),1),100)
)
select jsonb_build_object(
  'summary', coalesce((select jsonb_object_agg(evidence_status, n) from (select evidence_status,count(*) n from evidence group by evidence_status) s), '{}'::jsonb),
  'coverage', (select jsonb_build_object('orders',count(*),'lines',coalesce(sum(line_count),0),'orders_with_lines',count(*) filter(where line_count>0),'missing_currency',count(*) filter(where currency is null or currency !~ '^[A-Z]{3}$'),'missing_supplier_rut',count(*) filter(where not has_supplier_rut),'zero_line_orders',count(*) filter(where zero_lines>0),'linked_orders',count(*) filter(where has_canonical_link)) from evidence),
  'total', (select count(*) from filtered),
  'rows', coalesce((select jsonb_agg(to_jsonb(page) order by issued_date desc nulls last, external_id) from page), '[]'::jsonb),
  'formula_version','laudus_order_lines_v1',
  'financial_semantics','Nominal line sum only; tax, discounts, currency and open commitment not certified.'
);
$$;
revoke all on function public.motil_purchase_order_evidence_v1(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.motil_purchase_order_evidence_v1(uuid,text,integer,integer) to service_role;

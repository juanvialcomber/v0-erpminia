-- General workshop work orders do not require a canonical asset.
-- Keep missing_asset fail-closed for asset-bound work types while allowing
-- legitimate general work (e.g. orden y aseo) to flow by assignee/status.

create or replace view intelligence.work_order_flow as
with req as (
  select procurement_requests.organization_id,
         procurement_requests.work_order_id,
         count(*) as request_count,
         count(*) filter (
           where procurement_requests.status = any (array['draft','requested','pending','quoted','approved'])
         ) as open_request_count,
         max(procurement_requests.updated_at) as last_request_at
    from canonical.procurement_requests
   where procurement_requests.work_order_id is not null
   group by procurement_requests.organization_id, procurement_requests.work_order_id
),
po as (
  select r.organization_id,
         r.work_order_id,
         count(distinct o.id) as purchase_order_count,
         count(distinct o.id) filter (
           where coalesce(o.operational_status,o.status) <> all (array['received','completed','cancelled'])
         ) as open_purchase_order_count,
         coalesce(sum(o.total_amount),0::numeric) as purchase_commitment
    from canonical.procurement_requests r
    join canonical.purchase_orders o
      on o.procurement_request_id=r.id and o.organization_id=r.organization_id
   where r.work_order_id is not null
   group by r.organization_id,r.work_order_id
),
receipts as (
  select r.organization_id,
         r.work_order_id,
         count(distinct gr.id) as receipt_count,
         coalesce(sum(grl.quantity_accepted),0::numeric) as accepted_quantity
    from canonical.procurement_requests r
    join canonical.purchase_orders o
      on o.procurement_request_id=r.id and o.organization_id=r.organization_id
    join canonical.goods_receipts gr
      on gr.purchase_order_id=o.id and gr.organization_id=o.organization_id
    left join canonical.goods_receipt_lines grl
      on grl.receipt_id=gr.id and grl.organization_id=gr.organization_id
   where r.work_order_id is not null
   group by r.organization_id,r.work_order_id
),
parts as (
  select work_order_parts.organization_id,
         work_order_parts.work_order_id,
         count(*) as part_line_count,
         coalesce(sum(work_order_parts.quantity_requested),0::bigint) as quantity_requested,
         coalesce(sum(work_order_parts.quantity_issued),0::bigint) as quantity_issued,
         coalesce(sum(work_order_parts.quantity_installed),0::bigint) as quantity_installed,
         coalesce(sum(work_order_parts.quantity_returned),0::bigint) as quantity_returned,
         coalesce(sum(work_order_parts.total_cost),0::numeric) as parts_cost
    from work_order_parts
   group by work_order_parts.organization_id,work_order_parts.work_order_id
),
labor as (
  select work_order_labor_entries.organization_id,
         work_order_labor_entries.work_order_id,
         count(*) as labor_entry_count,
         coalesce(sum(work_order_labor_entries.hours),0::numeric) as labor_hours,
         coalesce(sum(work_order_labor_entries.hours * work_order_labor_entries.hourly_cost),0::numeric) as labor_cost
    from work_order_labor_entries
   group by work_order_labor_entries.organization_id,work_order_labor_entries.work_order_id
)
select wo.id as work_order_id,
       wo.organization_id,
       wo.work_order_number,
       wo.canonical_asset_id,
       a.asset_code,
       a.name as asset_name,
       wo.assigned_person_id,
       coalesce(p.full_name,wo.assigned_to_name) as assigned_person_name,
       wo.status,
       wo.priority,
       wo.work_type,
       wo.scheduled_date,
       wo.start_date,
       wo.completion_date,
       coalesce(req.request_count,0::bigint) as procurement_request_count,
       coalesce(req.open_request_count,0::bigint) as open_procurement_request_count,
       coalesce(po.purchase_order_count,0::bigint) as purchase_order_count,
       coalesce(po.open_purchase_order_count,0::bigint) as open_purchase_order_count,
       coalesce(po.purchase_commitment,0::numeric) as purchase_commitment,
       coalesce(receipts.receipt_count,0::bigint) as receipt_count,
       coalesce(receipts.accepted_quantity,0::numeric) as accepted_quantity,
       coalesce(parts.part_line_count,0::bigint) as part_line_count,
       coalesce(parts.quantity_requested,0::bigint) as quantity_requested,
       coalesce(parts.quantity_issued,0::bigint) as quantity_issued,
       coalesce(parts.quantity_installed,0::bigint) as quantity_installed,
       coalesce(parts.quantity_returned,0::bigint) as quantity_returned,
       coalesce(parts.parts_cost,0::numeric) as parts_cost,
       coalesce(labor.labor_entry_count,0::bigint) as labor_entry_count,
       coalesce(labor.labor_hours,0::numeric) as labor_hours,
       coalesce(labor.labor_cost,0::numeric) as labor_cost,
       coalesce(wo.external_cost,0::numeric) as external_cost,
       coalesce(parts.parts_cost,0::numeric)+coalesce(labor.labor_cost,0::numeric)+coalesce(wo.external_cost,0::numeric) as total_cost,
       case
         when wo.canonical_asset_id is null
              and lower(coalesce(wo.work_type,'')) <> 'general'
           then 'missing_asset'
         when wo.assigned_person_id is null then 'missing_person'
         when coalesce(req.open_request_count,0::bigint) > 0
           or coalesce(po.open_purchase_order_count,0::bigint) > 0
           then 'waiting_procurement'
         when coalesce(parts.quantity_requested,0::bigint) > coalesce(parts.quantity_issued,0::bigint)
           then 'waiting_parts'
         when wo.status = any(array['completed','closed']) then 'completed'
         when wo.status = any(array['in_progress','started']) then 'in_progress'
         else 'planned'
       end as flow_status
  from maintenance_work_orders wo
  left join canonical.assets a
    on a.id=wo.canonical_asset_id and a.organization_id=wo.organization_id
  left join people p
    on p.id=wo.assigned_person_id and p.organization_id=wo.organization_id
  left join req on req.organization_id=wo.organization_id and req.work_order_id=wo.id
  left join po on po.organization_id=wo.organization_id and po.work_order_id=wo.id
  left join receipts on receipts.organization_id=wo.organization_id and receipts.work_order_id=wo.id
  left join parts on parts.organization_id=wo.organization_id and parts.work_order_id=wo.id
  left join labor on labor.organization_id=wo.organization_id and labor.work_order_id=wo.id;

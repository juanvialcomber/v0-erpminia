-- Accounting management projection for MOTIL.
-- Preserves Laudus journal entries as source evidence and exposes line dimensions
-- without promoting accounting rows into the operational ledger.

create or replace view public.laudus_accounting_lines_service_v1
with (security_invoker=true) as
with base as (
  select
    e.id as accounting_entry_id,
    e.organization_id,
    e.source_id,
    e.external_id,
    e.entry_number,
    e.entry_date,
    e.entry_type,
    e.source_updated_at,
    e.payload_hash,
    e.observed_at,
    e.synced_at,
    e.source_payload,
    case
      when jsonb_typeof(e.source_payload->'lines')='array'
        and jsonb_array_length(e.source_payload->'lines') > 0
      then e.source_payload->'lines'
      else jsonb_build_array(
        jsonb_build_object(
          'lineId', e.source_payload->'lines_lineId',
          'account', jsonb_build_object(
            'accountNumber', e.source_payload->'lines_account_accountNumber',
            'name', e.source_payload->'lines_account_name'
          ),
          'description', e.source_payload->'lines_description',
          'debit', e.source_payload->'lines_debit',
          'credit', e.source_payload->'lines_credit',
          'currencyCode', e.source_payload->'lines_currencyCode',
          'costCenter', jsonb_build_object(
            'costCenterId', e.source_payload->'lines_costCenter_costCenterId'
          ),
          'document', e.source_payload->'lines_document'
        )
      )
    end as normalized_lines
  from integration.laudus_accounting_entries e
)
select
  b.accounting_entry_id,
  b.organization_id,
  b.source_id,
  b.external_id,
  b.entry_number,
  b.entry_date,
  b.entry_type,
  nullif(line->>'lineId','') as line_external_id,
  nullif(line#>>'{account,accountNumber}','') as account_number,
  nullif(line#>>'{account,name}','') as account_name,
  nullif(line->>'description','') as line_description,
  case when nullif(line->>'debit','') is not null then (line->>'debit')::numeric else 0 end as debit,
  case when nullif(line->>'credit','') is not null then (line->>'credit')::numeric else 0 end as credit,
  nullif(line->>'currencyCode','') as currency_code,
  nullif(line#>>'{costCenter,costCenterId}','') as cost_center_external_id,
  nullif(line->>'document','') as document_number,
  b.source_updated_at,
  b.payload_hash,
  b.observed_at,
  b.synced_at
from base b
cross join lateral jsonb_array_elements(b.normalized_lines) line
where
  nullif(line->>'lineId','') is not null
  or nullif(line#>>'{account,accountNumber}','') is not null
  or nullif(line->>'description','') is not null
  or nullif(line->>'debit','') is not null
  or nullif(line->>'credit','') is not null;

create or replace view public.laudus_accounting_management_summary_v1
with (security_invoker=true) as
select
  organization_id,
  count(*)::bigint as line_rows,
  count(distinct accounting_entry_id)::bigint as entries_with_lines,
  count(*) filter (where account_number is not null)::bigint as with_account,
  count(*) filter (where currency_code is not null)::bigint as with_currency,
  count(*) filter (where cost_center_external_id is not null)::bigint as with_cost_center,
  count(*) filter (where line_description is not null)::bigint as with_description,
  count(*) filter (where document_number is not null)::bigint as with_document,
  min(entry_date) as first_entry_date,
  max(entry_date) as last_entry_date
from public.laudus_accounting_lines_service_v1
group by organization_id;

revoke all on public.laudus_accounting_lines_service_v1 from public,anon,authenticated;
revoke all on public.laudus_accounting_management_summary_v1 from public,anon,authenticated;
grant select on public.laudus_accounting_lines_service_v1 to service_role;
grant select on public.laudus_accounting_management_summary_v1 to service_role;

comment on view public.laudus_accounting_lines_service_v1 is
  'Read-only Laudus accounting line evidence for MOTIL management. Does not post or rewrite canonical operational ledger.';

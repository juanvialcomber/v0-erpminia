create or replace view public.laudus_missing_supplier_recovery_candidates_v2 as
with missing as (
  select
    q.organization_id,
    q.external_id,
    q.document_number,
    q.issued_date::date as issued_date,
    q.original_amount,
    case
      when q.document_number ~ '^[0-9]+$' then q.document_number::bigint
      else null
    end as document_number_numeric
  from public.laudus_accounts_payable_quality_v1 q
  where q.quality_status = 'invalido_sin_proveedor'
),
verified as (
  select
    q.organization_id,
    q.supplier_external_id,
    coalesce(nullif(q.source_payload->>'supplierName',''), q.supplier_external_id) as supplier_name,
    q.document_number,
    q.issued_date::date as issued_date,
    q.original_amount,
    case
      when q.document_number ~ '^[0-9]+$' then q.document_number::bigint
      else null
    end as document_number_numeric
  from public.laudus_accounts_payable_quality_v1 q
  where q.quality_status = 'verificado'
    and q.supplier_external_id is not null
),
candidate_stats as (
  select
    m.organization_id,
    m.external_id,
    m.document_number,
    m.issued_date,
    m.original_amount,
    v.supplier_external_id,
    max(v.supplier_name) as supplier_name,
    count(*) filter (
      where m.document_number_numeric is not null
        and v.document_number_numeric is not null
        and abs(v.document_number_numeric - m.document_number_numeric) <= 500
        and abs(v.issued_date - m.issued_date) <= 60
    ) as local_support,
    count(*) filter (
      where v.original_amount = m.original_amount
        and abs(v.issued_date - m.issued_date) <= 180
    ) as exact_amount_hits,
    min(abs(v.document_number_numeric - m.document_number_numeric)) filter (
      where m.document_number_numeric is not null
        and v.document_number_numeric is not null
        and abs(v.document_number_numeric - m.document_number_numeric) <= 500
        and abs(v.issued_date - m.issued_date) <= 60
    ) as min_folio_gap,
    min(abs(v.issued_date - m.issued_date)) filter (
      where abs(v.issued_date - m.issued_date) <= 180
    ) as min_date_gap
  from missing m
  join verified v
    on v.organization_id = m.organization_id
   and (
     (
       m.document_number_numeric is not null
       and v.document_number_numeric is not null
       and abs(v.document_number_numeric - m.document_number_numeric) <= 500
       and abs(v.issued_date - m.issued_date) <= 60
     )
     or (
       v.original_amount = m.original_amount
       and abs(v.issued_date - m.issued_date) <= 180
     )
   )
  group by
    m.organization_id,
    m.external_id,
    m.document_number,
    m.issued_date,
    m.original_amount,
    v.supplier_external_id
),
scored as (
  select
    c.*,
    (
      c.local_support * 4
      + c.exact_amount_hits * 3
      + case when c.min_folio_gap is not null and c.min_folio_gap <= 100 then 2 else 0 end
      + case when c.min_date_gap is not null and c.min_date_gap <= 30 then 1 else 0 end
    )::integer as score
  from candidate_stats c
),
ranked as (
  select
    s.*,
    row_number() over (
      partition by s.organization_id, s.external_id
      order by
        s.score desc,
        s.local_support desc,
        s.exact_amount_hits desc,
        s.min_folio_gap nulls last,
        s.min_date_gap nulls last,
        s.supplier_external_id
    ) as candidate_rank,
    lead(s.score) over (
      partition by s.organization_id, s.external_id
      order by
        s.score desc,
        s.local_support desc,
        s.exact_amount_hits desc,
        s.min_folio_gap nulls last,
        s.min_date_gap nulls last,
        s.supplier_external_id
    ) as second_score
  from scored s
)
select
  r.organization_id,
  r.external_id,
  r.document_number,
  r.issued_date,
  r.original_amount,
  r.supplier_external_id as proposed_supplier_external_id,
  r.supplier_name as proposed_supplier_name,
  r.local_support,
  r.exact_amount_hits,
  r.min_folio_gap,
  r.min_date_gap,
  r.score,
  r.second_score,
  case
    when r.score >= 12
      and (r.second_score is null or r.score >= r.second_score + 5)
      and r.local_support >= 3
      then 'alta_confianza'
    else 'revisar'
  end as candidate_status,
  case
    when r.score >= 12
      and (r.second_score is null or r.score >= r.second_score + 5)
      and r.local_support >= 3
      then true
    else false
  end as high_confidence,
  'evidencia_historica_no_canonica'::text as authority
from ranked r
where r.candidate_rank = 1;

comment on view public.laudus_missing_supplier_recovery_candidates_v2 is
'Preclasifica candidatos de proveedor para CxP Laudus con proveedor faltante usando evidencia histórica local. No promueve ni modifica proveedor, factura, pago o dato canónico.';

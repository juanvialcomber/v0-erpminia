-- Backend-only executive value scorecard.
-- Aggregates evidence without exposing integration schema or treating observations as accounting truth.

CREATE OR REPLACE FUNCTION public.motil_value_scorecard_preview(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'integration', 'pg_temp'
AS $function$
with
connected as (
  select
    (select count(*) from integration.laudus_suppliers where organization_id=p_organization_id)::int suppliers,
    (select count(*) from integration.laudus_purchase_orders where organization_id=p_organization_id)::int purchase_orders,
    (select count(*) from integration.laudus_purchase_invoices where organization_id=p_organization_id)::int purchase_invoices
),
reviews as (
  select
    count(*)::int total,
    count(*) filter(where decision='approved')::int approved,
    avg(review_duration_ms)::numeric average_review_ms
  from public.laudus_match_review_decisions
  where organization_id=p_organization_id
),
decisions as (
  select
    count(*)::int total,
    count(*) filter(where decision='action_required')::int action_required
  from public.procurement_supply_risk_decisions
  where organization_id=p_organization_id
),
outcomes as (
  select
    count(*)::int total,
    count(*) filter(where outcome in ('resolved','risk_reduced'))::int positive,
    count(*) filter(where outcome='false_positive')::int false_positive,
    avg(risk_score_before-risk_score_after)::numeric avg_risk_reduction,
    avg(time_to_outcome_ms)::numeric avg_time_to_outcome_ms
  from public.procurement_supply_risk_outcomes
  where organization_id=p_organization_id
),
value_evidence as (
  select
    count(*)::int total,
    count(*) filter(where evidence_level='E3')::int e3,
    coalesce(sum(observed_minutes),0)::numeric observed_minutes,
    coalesce(sum(observed_value_clp),0)::numeric observed_value_clp
  from public.procurement_supply_value_evidence
  where organization_id=p_organization_id
),
risk as (
  select public.motil_supply_risk_preview(p_organization_id,365) payload
)
select jsonb_build_object(
  'connectedData',jsonb_build_object(
    'suppliers',connected.suppliers,
    'purchaseOrders',connected.purchase_orders,
    'purchaseInvoices',connected.purchase_invoices,
    'supplyRiskProducts',coalesce((risk.payload->'summary'->>'total_products')::int,0),
    'supplySignalsHigh',coalesce((risk.payload->'summary'->>'high_risk')::int,0),
    'supplySignalsMedium',coalesce((risk.payload->'summary'->>'medium_risk')::int,0)
  ),
  'assistedDecision',jsonb_build_object(
    'matchReviews',reviews.total,
    'matchAcceptanceRate',case when reviews.total>0 then reviews.approved::numeric/reviews.total else null end,
    'averageMatchReviewSeconds',case when reviews.average_review_ms is not null then reviews.average_review_ms/1000 else null end,
    'supplyDecisions',decisions.total,
    'supplyActions',decisions.action_required,
    'supplyActionRate',case when decisions.total>0 then decisions.action_required::numeric/decisions.total else null end
  ),
  'outcomes',jsonb_build_object(
    'closed',outcomes.total,
    'positive',outcomes.positive,
    'positiveRate',case when outcomes.total>0 then outcomes.positive::numeric/outcomes.total else null end,
    'falsePositives',outcomes.false_positive,
    'averageRiskReduction',outcomes.avg_risk_reduction,
    'averageTimeToOutcomeHours',case when outcomes.avg_time_to_outcome_ms is not null then outcomes.avg_time_to_outcome_ms/3600000 else null end
  ),
  'observedImpact',jsonb_build_object(
    'records',value_evidence.total,
    'e3Records',value_evidence.e3,
    'observedMinutes',value_evidence.observed_minutes,
    'observedValueClp',value_evidence.observed_value_clp,
    'accountingTruth',false,
    'auditedSavings',false
  ),
  'evidenceLevel',case when value_evidence.e3>0 then 'E3'
                       when outcomes.total>0 or value_evidence.total>0 then 'E2'
                       else 'E1' end,
  'workflowLevel',4,
  'adoptionGate',jsonb_build_object(
    'matchCalibration',case when reviews.total>=20 then 'PASS' else 'HOLD' end,
    'supplyOutcomes',case when outcomes.total>=5 then 'PASS' else 'HOLD' end,
    'valueEvidence',case when value_evidence.e3>=3 then 'PASS' else 'HOLD' end
  ),
  'scaleGate',case when reviews.total>=20 and outcomes.total>=5 and value_evidence.e3>=3 then 'SCALE' else 'CONDITIONAL' end
)
from connected,reviews,decisions,outcomes,value_evidence,risk;
$function$
;

revoke all on function public.motil_value_scorecard_preview(uuid) from public,anon,authenticated;
grant execute on function public.motil_value_scorecard_preview(uuid) to service_role;

comment on function public.motil_value_scorecard_preview(uuid) is
  'Admin-facing read-only value scorecard for MOTIL. Separates connected data, assisted decisions, outcomes and observed evidence; never asserts audited ROI.';

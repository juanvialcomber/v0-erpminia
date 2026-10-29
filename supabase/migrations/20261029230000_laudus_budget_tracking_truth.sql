-- Make Laudus API budget semantics honest while the usage ledger is still partial.
-- Calls made before exact tracking started cannot be reconstructed safely, so remaining
-- monthly headroom must stay unknown until tracking covers a full calendar month.

create or replace view public.laudus_api_budget_service_v1
with (security_invoker = true)
as
with monthly as (
  select
    s.organization_id,
    min(u.first_called_at) as exact_tracking_from,
    max(u.last_called_at) filter (
      where u.usage_date >= date_trunc('month', current_date)::date
    ) as last_call_at,
    coalesce(sum(u.request_count) filter (
      where u.usage_date >= date_trunc('month', current_date)::date
    ), 0)::integer as tracked_calls_this_month,
    coalesce(sum(u.login_count) filter (
      where u.usage_date >= date_trunc('month', current_date)::date
    ), 0)::integer as login_calls_this_month,
    coalesce(sum(u.error_count) filter (
      where u.usage_date >= date_trunc('month', current_date)::date
    ), 0)::integer as error_calls_this_month
  from integration.external_sources s
  left join integration.laudus_api_usage_daily u on u.source_id=s.id
  where s.source_key='laudus'
  group by s.organization_id
)
select
  organization_id,
  2000::integer as monthly_limit,
  tracked_calls_this_month,
  case
    when exact_tracking_from is not null
     and exact_tracking_from <= date_trunc('month', now())
      then greatest(2000 - tracked_calls_this_month, 0)::integer
    else null::integer
  end as tracked_remaining,
  exact_tracking_from,
  last_call_at,
  login_calls_this_month,
  error_calls_this_month,
  case
    when exact_tracking_from is null then 'pending_first_tracked_call'
    when exact_tracking_from > date_trunc('month', now()) then 'partial_month'
    else 'full_month'
  end::text as tracking_status,
  (
    exact_tracking_from is not null
    and exact_tracking_from <= date_trunc('month', now())
  ) as monthly_remaining_exact
from monthly;

comment on view public.laudus_api_budget_service_v1 is
'Laudus monthly API usage. tracked_remaining is NULL unless the ledger covers the full current calendar month; never infer exact monthly headroom from partial tracking.';

revoke all on public.laudus_api_budget_service_v1 from public, anon, authenticated;
grant select on public.laudus_api_budget_service_v1 to service_role;

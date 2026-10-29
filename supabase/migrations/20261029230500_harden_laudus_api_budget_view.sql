-- Restrict Laudus API budget read model to least privilege.

revoke all on public.laudus_api_budget_service_v1 from service_role;
grant select on public.laudus_api_budget_service_v1 to service_role;

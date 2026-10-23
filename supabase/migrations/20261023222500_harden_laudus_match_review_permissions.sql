revoke all on table public.laudus_match_review_decisions from service_role;
grant select, insert on table public.laudus_match_review_decisions to service_role;

comment on table public.laudus_match_review_decisions is
  'Immutable human feedback on Laudus invoice-to-purchase-order candidates. Service role is limited to SELECT and INSERT; decisions are append-only from the application.';

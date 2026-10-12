-- Pilot delivery proof only: no change to recipients, sessions or operational data.
alter table public.user_push_subscriptions
  add column if not exists last_test_id uuid,
  add column if not exists last_test_receipt_hash text,
  add column if not exists last_test_provider_status integer,
  add column if not exists last_test_received_at timestamptz,
  add column if not exists last_test_displayed_at timestamptz,
  add column if not exists last_test_clicked_at timestamptz,
  add column if not exists last_test_display_error text;
create unique index if not exists user_push_subscriptions_test_id_idx
  on public.user_push_subscriptions (last_test_id) where last_test_id is not null;

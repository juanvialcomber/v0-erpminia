-- Defense-in-depth hardening for MOTIL integration staging.
-- Browser roles already have no schema/table access. This migration makes that
-- boundary explicit and enables RLS on all integration tables that still lacked it.
-- Server-side service_role clients continue to bypass RLS.

revoke all on schema integration from anon, authenticated;
grant usage on schema integration to service_role;

do $$
declare
  rec record;
begin
  for rec in
    select tablename
    from pg_tables
    where schemaname = 'integration'
  loop
    execute format('alter table integration.%I enable row level security', rec.tablename);
    execute format('revoke all on table integration.%I from anon, authenticated', rec.tablename);
    execute format('grant select, insert, update, delete on table integration.%I to service_role', rec.tablename);
  end loop;
end
$$;

alter default privileges in schema integration revoke all on tables from anon, authenticated;
alter default privileges in schema integration grant select, insert, update, delete on tables to service_role;

alter default privileges in schema integration revoke usage, select on sequences from anon, authenticated;
alter default privileges in schema integration grant usage, select on sequences to service_role;

comment on schema integration is
  'Server-only integration staging. Direct anon/authenticated access is prohibited; application access is mediated by authenticated server APIs.';

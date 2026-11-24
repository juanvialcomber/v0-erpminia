begin;

do $$
declare
  v_view text;
  v_fn text;
begin
  select pg_get_viewdef('public.work_order_close_readiness_v2'::regclass, true)
    into v_view;

  v_view := replace(
    v_view,
    'lower(COALESCE(wo.work_type, ''''::text)) <> ''general''::text AND COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) = ''''::text',
    'NOT (lower(COALESCE(wo.work_type, ''''::text)) = ANY (ARRAY[''general''::text, ''preventive''::text, ''preventivo''::text])) AND COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) = ''''::text'
  );
  v_view := replace(
    v_view,
    'lower(COALESCE(wo.work_type, ''''::text)) <> ''general''::text AND COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) = ''''::text',
    'NOT (lower(COALESCE(wo.work_type, ''''::text)) = ANY (ARRAY[''general''::text, ''preventive''::text, ''preventivo''::text])) AND COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) = ''''::text'
  );
  v_view := replace(
    v_view,
    '(lower(COALESCE(wo.work_type, ''''::text)) = ''general''::text OR COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) <> ''''::text)',
    '((lower(COALESCE(wo.work_type, ''''::text)) = ANY (ARRAY[''general''::text, ''preventive''::text, ''preventivo''::text])) OR COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) <> ''''::text)'
  );
  v_view := replace(
    v_view,
    '(lower(COALESCE(wo.work_type, ''''::text)) = ''general''::text OR COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) <> ''''::text)',
    '((lower(COALESCE(wo.work_type, ''''::text)) = ANY (ARRAY[''general''::text, ''preventive''::text, ''preventivo''::text])) OR COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) <> ''''::text)'
  );

  execute 'create or replace view public.work_order_close_readiness_v2 as ' || v_view;

  select pg_get_functiondef(p.oid)
    into v_fn
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='close_work_order_safely';

  v_fn := replace(
    v_fn,
    'if lower(coalesce(v_wo.work_type, '''')) <> ''general'' and coalesce(trim(v_wo.root_cause), '''') = '''' then',
    'if lower(coalesce(v_wo.work_type, '''')) not in (''general'',''preventive'',''preventivo'') and coalesce(trim(v_wo.root_cause), '''') = '''' then'
  );
  v_fn := replace(
    v_fn,
    'if lower(coalesce(v_wo.work_type, '''')) <> ''general'' and coalesce(trim(v_wo.preventive_actions), '''') = '''' then',
    'if lower(coalesce(v_wo.work_type, '''')) not in (''general'',''preventive'',''preventivo'') and coalesce(trim(v_wo.preventive_actions), '''') = '''' then'
  );

  execute v_fn;
end
$$;

commit;

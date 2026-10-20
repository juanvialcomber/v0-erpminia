do $$
declare
  v_view text;
  v_fn text;
begin
  v_view := pg_get_viewdef('public.work_order_close_readiness_v2'::regclass, true);

  if position('wo.canonical_asset_id IS NULL AS missing_asset' in v_view) = 0 then
    raise exception 'work_order_close_readiness_v2 definition changed: missing_asset marker not found';
  end if;

  v_view := replace(v_view,
    'wo.canonical_asset_id IS NULL AS missing_asset',
    '(wo.canonical_asset_id IS NULL AND lower(COALESCE(wo.work_type, '''')) <> ''general'') AS missing_asset');
  v_view := replace(v_view,
    'COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) = ''''::text AS missing_root_cause',
    '(lower(COALESCE(wo.work_type, '''')) <> ''general'' AND COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) = ''''::text) AS missing_root_cause');
  v_view := replace(v_view,
    'COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) = ''''::text AS missing_preventive_actions',
    '(lower(COALESCE(wo.work_type, '''')) <> ''general'' AND COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) = ''''::text) AS missing_preventive_actions');
  v_view := replace(v_view,
    'wo.canonical_asset_id IS NOT NULL AND COALESCE(sp.pending_steps, 0) = 0 AND COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) <> ''''::text AND COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) <> ''''::text AND COALESCE(wo.actual_duration_hours, 0::numeric) > 0::numeric',
    '(wo.canonical_asset_id IS NOT NULL OR lower(COALESCE(wo.work_type, '''')) = ''general'') AND COALESCE(sp.pending_steps, 0) = 0 AND (lower(COALESCE(wo.work_type, '''')) = ''general'' OR COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) <> ''''::text) AND (lower(COALESCE(wo.work_type, '''')) = ''general'' OR COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) <> ''''::text) AND COALESCE(wo.actual_duration_hours, 0::numeric) > 0::numeric');
  v_view := replace(v_view,
    'WHEN wo.canonical_asset_id IS NULL THEN ''resolve_asset''::text',
    'WHEN wo.canonical_asset_id IS NULL AND lower(COALESCE(wo.work_type, '''')) <> ''general'' THEN ''resolve_asset''::text');
  v_view := replace(v_view,
    'WHEN COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) = ''''::text THEN ''record_root_cause''::text',
    'WHEN lower(COALESCE(wo.work_type, '''')) <> ''general'' AND COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) = ''''::text THEN ''record_root_cause''::text');
  v_view := replace(v_view,
    'WHEN COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) = ''''::text THEN ''record_preventive_actions''::text',
    'WHEN lower(COALESCE(wo.work_type, '''')) <> ''general'' AND COALESCE(TRIM(BOTH FROM wo.preventive_actions), ''''::text) = ''''::text THEN ''record_preventive_actions''::text');

  execute 'create or replace view public.work_order_close_readiness_v2 as ' || v_view;

  select pg_get_functiondef(p.oid) into v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'close_work_order_safely'
  limit 1;

  if v_fn is null then
    raise exception 'close_work_order_safely not found';
  end if;

  v_fn := replace(v_fn,
    'if v_wo.canonical_asset_id is null then
    raise exception ''La orden no puede cerrarse sin equipo asociado'';
  end if;',
    'if v_wo.canonical_asset_id is null and lower(coalesce(v_wo.work_type, '''')) <> ''general'' then
    raise exception ''La orden no puede cerrarse sin equipo asociado'';
  end if;');
  v_fn := replace(v_fn,
    'if coalesce(trim(v_wo.root_cause), '''') = '''' then
    raise exception ''Registra la causa principal antes de cerrar'';
  end if;',
    'if lower(coalesce(v_wo.work_type, '''')) <> ''general'' and coalesce(trim(v_wo.root_cause), '''') = '''' then
    raise exception ''Registra la causa principal antes de cerrar'';
  end if;');
  v_fn := replace(v_fn,
    'if coalesce(trim(v_wo.preventive_actions), '''') = '''' then
    raise exception ''Registra la acción preventiva antes de cerrar'';
  end if;',
    'if lower(coalesce(v_wo.work_type, '''')) <> ''general'' and coalesce(trim(v_wo.preventive_actions), '''') = '''' then
    raise exception ''Registra la acción preventiva antes de cerrar'';
  end if;');

  execute v_fn;
end
$$;

comment on view public.work_order_close_readiness_v2 is
'General workshop work (work_type=general) may close without an equipment association or failure-cause fields; equipment work keeps the existing closure safeguards.';

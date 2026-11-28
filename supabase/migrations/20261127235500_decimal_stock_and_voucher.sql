-- Draft only: canonical decimal stock plus fractional voucher fulfillment.
-- Must run in one transaction. ALTER COLUMN TYPE takes ACCESS EXCLUSIVE locks and
-- rebuilds dependent indexes. Do not split this migration.

DO $migration$
DECLARE
  v record;
  v_acl record;
  v_col record;
  v_col_acl record;
  v_grantee text;
  v_sql text;
  v_rpc text;
  v_changed_rpc text;
  v_reserve_def text;
  v_changed_reserve text;
  v_available_comment text;
  v_available_acl aclitem[];
BEGIN
  -- Do not run against the isolated QA fixture schemas or a partially migrated
  -- branch. This is intentionally tied to the deployed canonical contract.
  IF to_regclass('public.warehouse_stock') IS NULL
     OR to_regclass('public.stock_movements') IS NULL
     OR to_regprocedure('public.warehouse_voucher_command_v1(uuid,uuid,text,jsonb)') IS NULL
     OR to_regprocedure('public.reserve_available_materials_to_work_order_v1(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'decimal migration requires the complete production schema in public';
  END IF;
  IF (SELECT atttypid <> 'integer'::regtype FROM pg_attribute
      WHERE attrelid='public.warehouse_stock'::regclass AND attname='quantity_on_hand' AND NOT attisdropped)
     OR (SELECT atttypid <> 'integer'::regtype FROM pg_attribute
      WHERE attrelid='public.warehouse_stock'::regclass AND attname='quantity_reserved' AND NOT attisdropped)
     OR (SELECT atttypid <> 'integer'::regtype FROM pg_attribute
      WHERE attrelid='public.stock_movements'::regclass AND attname='quantity' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'decimal migration precondition failed: expected integer canonical quantities';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.warehouse_stock'::regclass
      AND attname='quantity_available' AND attgenerated='s' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'decimal migration precondition failed: quantity_available is not the expected stored generated column';
  END IF;

  -- Save the complete dependent view graph, including security options, owner,
  -- ACL, comments, column comments/ACL, and check option before dropping views.
  CREATE TEMP TABLE _decimal_stock_views ON COMMIT DROP AS
  WITH RECURSIVE view_edges AS (
    SELECT DISTINCT rw.ev_class AS view_oid, d.refobjid AS source_oid
    FROM pg_rewrite rw
    JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid
    JOIN pg_class dependent ON dependent.oid = rw.ev_class
    WHERE dependent.relkind = 'v'
  ), roots AS (
    SELECT c.oid
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('warehouse_stock','stock_movements')
  ), closure(view_oid, depth, path) AS (
    SELECT e.view_oid, 1, ARRAY[r.oid,e.view_oid]
    FROM view_edges e JOIN roots r ON r.oid = e.source_oid
    UNION ALL
    SELECT e.view_oid, c.depth + 1, c.path || e.view_oid
    FROM closure c JOIN view_edges e ON e.source_oid = c.view_oid
    WHERE NOT e.view_oid = ANY (c.path)
  ), view_set AS (
    SELECT view_oid, max(depth) AS depth FROM closure GROUP BY view_oid
  )
  SELECT vs.depth, c.oid, n.nspname, c.relname, c.relowner,
         c.reloptions, c.relacl, pg_get_viewdef(c.oid, true) AS definition,
         coalesce(iv.check_option, 'NONE') AS check_option,
         obj_description(c.oid, 'pg_class') AS object_comment
  FROM view_set vs
  JOIN pg_class c ON c.oid = vs.view_oid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN information_schema.views iv ON iv.table_schema = n.nspname AND iv.table_name = c.relname;

  CREATE TEMP TABLE _decimal_stock_view_columns ON COMMIT DROP AS
  SELECT v.oid AS view_oid, a.attnum, a.attname, col_description(v.oid,a.attnum) AS comment,
         a.attacl AS acl
  FROM _decimal_stock_views view_row
  JOIN pg_attribute a ON a.attrelid = view_row.oid AND a.attnum > 0 AND NOT a.attisdropped;

  SELECT col_description('public.warehouse_stock'::regclass,a.attnum),a.attacl
    INTO v_available_comment,v_available_acl
  FROM pg_attribute a
  WHERE a.attrelid='public.warehouse_stock'::regclass AND a.attname='quantity_available';

  -- Refuse unsupported dependent object kinds instead of losing them.
  IF EXISTS (
    SELECT 1
    FROM pg_depend d
    JOIN pg_rewrite rw ON d.classid='pg_rewrite'::regclass AND d.objid=rw.oid
    JOIN _decimal_stock_views source_view ON source_view.oid=d.refobjid
    JOIN pg_class dependent ON dependent.oid=rw.ev_class
    WHERE dependent.relkind <> 'v'
  ) THEN
    RAISE EXCEPTION 'decimal migration found dependent materialized/unsupported relation; inspect pg_depend first';
  END IF;

  -- Drop deepest dependents first. All captured definitions are restored below.
  FOR v IN SELECT * FROM _decimal_stock_views ORDER BY depth DESC, oid LOOP
    EXECUTE format('DROP VIEW %I.%I',v.nspname,v.relname);
  END LOOP;

  -- quantity_available is generated from both base columns. Recreate it after
  -- altering both source types so the expression and its numeric result agree.
  -- PostgreSQL appends a dropped/recreated column at the end of the table's
  -- physical column order; all dependent views retain their captured order.
  ALTER TABLE public.warehouse_stock DROP COLUMN quantity_available;
  ALTER TABLE public.warehouse_stock
    ALTER COLUMN quantity_on_hand DROP DEFAULT,
    ALTER COLUMN quantity_reserved DROP DEFAULT;
  ALTER TABLE public.warehouse_stock
    ALTER COLUMN quantity_on_hand TYPE numeric(20,6)
      USING quantity_on_hand::numeric(20,6),
    ALTER COLUMN quantity_reserved TYPE numeric(20,6)
      USING quantity_reserved::numeric(20,6);
  ALTER TABLE public.warehouse_stock
    ADD COLUMN quantity_available numeric(20,6)
      GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED;
  ALTER TABLE public.warehouse_stock
    ALTER COLUMN quantity_on_hand SET DEFAULT 0,
    ALTER COLUMN quantity_reserved SET DEFAULT 0;
  IF v_available_comment IS NOT NULL THEN
    EXECUTE format('COMMENT ON COLUMN public.warehouse_stock.quantity_available IS %L',v_available_comment);
  END IF;
  IF v_available_acl IS NOT NULL THEN
    FOR v_acl IN SELECT * FROM aclexplode(v_available_acl) LOOP
      IF v_acl.grantee <> (SELECT relowner FROM pg_class WHERE oid='public.warehouse_stock'::regclass) THEN
        v_grantee := CASE WHEN v_acl.grantee=0 THEN 'PUBLIC'
                          ELSE quote_ident(pg_get_userbyid(v_acl.grantee)) END;
        EXECUTE format('GRANT %s (quantity_available) ON public.warehouse_stock TO %s%s',
          v_acl.privilege_type,v_grantee,
          CASE WHEN v_acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
      END IF;
    END LOOP;
  END IF;
  ALTER TABLE public.stock_movements
    ALTER COLUMN quantity TYPE numeric(20,6)
      USING quantity::numeric(20,6);

  -- Restore views in dependency order under a search_path that resolves
  -- unqualified names to the same owning schema first, then canonical schemas.
  FOR v IN SELECT * FROM _decimal_stock_views ORDER BY depth, oid LOOP
    PERFORM set_config('search_path',format('%I,public,canonical,integration,intelligence,auth,pg_catalog',v.nspname),true);
    v_sql := format('CREATE VIEW %I.%I',v.nspname,v.relname);
    IF v.reloptions IS NOT NULL THEN
      v_sql := v_sql || format(' WITH (%s)',array_to_string(v.reloptions,','));
    END IF;
    v_sql := v_sql || ' AS ' || v.definition;
    IF v.check_option <> 'NONE' THEN
      v_sql := v_sql || ' WITH ' || v.check_option || ' CHECK OPTION';
    END IF;
    EXECUTE v_sql;
    EXECUTE format('ALTER VIEW %I.%I OWNER TO %I',v.nspname,v.relname,pg_get_userbyid(v.relowner));
    IF v.object_comment IS NOT NULL THEN
      EXECUTE format('COMMENT ON VIEW %I.%I IS %L',v.nspname,v.relname,v.object_comment);
    END IF;

    -- Reapply only non-owner relation privileges; owner privileges are implicit.
    FOR v_acl IN
      SELECT x.grantee,x.privilege_type,x.is_grantable
      FROM aclexplode(v.relacl) x
      WHERE v.relacl IS NOT NULL AND x.grantee <> v.relowner
        AND x.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
    LOOP
      v_grantee := CASE WHEN v_acl.grantee=0 THEN 'PUBLIC'
                        ELSE quote_ident(pg_get_userbyid(v_acl.grantee)) END;
      EXECUTE format('GRANT %s ON %I.%I TO %s%s',v_acl.privilege_type,
        v.nspname,v.relname,v_grantee,
        CASE WHEN v_acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
    END LOOP;

    -- Restore column comments. Column-level grants are preserved by the ACL
    -- snapshot and reapplied individually.
    FOR v_col IN SELECT * FROM _decimal_stock_view_columns WHERE view_oid=v.oid LOOP
      IF v_col.comment IS NOT NULL THEN
        EXECUTE format('COMMENT ON COLUMN %I.%I.%I IS %L',v.nspname,v.relname,v_col.attname,v_col.comment);
      END IF;
      IF v_col.acl IS NOT NULL THEN
        FOR v_col_acl IN
          SELECT x.grantee,x.privilege_type,x.is_grantable
          FROM aclexplode(v_col.acl) x
          WHERE x.grantee <> v.relowner
            AND x.privilege_type IN ('SELECT','INSERT','UPDATE')
        LOOP
          v_grantee := CASE WHEN v_col_acl.grantee=0 THEN 'PUBLIC'
                            ELSE quote_ident(pg_get_userbyid(v_col_acl.grantee)) END;
          EXECUTE format('GRANT %s (%I) ON %I.%I TO %s%s',
            v_col_acl.privilege_type,v_col.attname,v.nspname,v.relname,v_grantee,
            CASE WHEN v_col_acl.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  -- Preserve the deployed voucher RPC in full and remove only the intentional
  -- integer-only guard. Fail closed if the deployed body differs from the
  -- reviewed contract instead of silently changing the wrong function.
  SELECT pg_get_functiondef('public.warehouse_voucher_command_v1(uuid,uuid,text,jsonb)'::regprocedure)
    INTO v_rpc;
  IF position('decimal_stock_contract_pending' in v_rpc)=0 THEN
    RAISE EXCEPTION 'expected integer-only voucher guard not found; review RPC before migration';
  END IF;
  v_changed_rpc := regexp_replace(v_rpc,
    E'\\s*-- Current canonical stock/movements are integers\\. Reject fractions, NEVER round\\.\\s*-- Reuse the decimal fulfillment migration when it is separately verified\\.\\s*if q<>trunc\\(q\\) then raise exception ''decimal_stock_contract_pending''; end if;',
    '', 'g');
  IF v_changed_rpc=v_rpc OR position('decimal_stock_contract_pending' in v_changed_rpc)>0 THEN
    RAISE EXCEPTION 'voucher guard replacement did not match; review function body';
  END IF;
  EXECUTE v_changed_rpc;

  -- Legacy work-order reservations remain whole-unit operations. When a
  -- fractional balance exists, reserve only its whole-unit floor; never round
  -- a fractional available balance upward into an integer reservation.
  SELECT pg_get_functiondef(
    'public.reserve_available_materials_to_work_order_v1(uuid,uuid)'::regprocedure
  ) INTO v_reserve_def;
  IF position('v_take := least(v_needed, greatest(coalesce(v_stock.quantity_on_hand,0) - coalesce(v_stock.quantity_reserved,0),0));' in v_reserve_def)=0 THEN
    RAISE EXCEPTION 'expected integer reservation expression not found; review reservation RPC before migration';
  END IF;
  v_changed_reserve := replace(
    v_reserve_def,
    'v_take := least(v_needed, greatest(coalesce(v_stock.quantity_on_hand,0) - coalesce(v_stock.quantity_reserved,0),0));',
    'v_take := least(v_needed, floor(greatest(coalesce(v_stock.quantity_on_hand,0) - coalesce(v_stock.quantity_reserved,0),0))::integer);'
  );
  IF v_changed_reserve=v_reserve_def THEN
    RAISE EXCEPTION 'reservation expression replacement did not match';
  END IF;
  EXECUTE v_changed_reserve;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.warehouse_stock'::regclass
      AND attname='quantity_available' AND attgenerated='s'
      AND atttypid='numeric'::regtype AND NOT attisdropped
  ) OR EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.warehouse_stock'::regclass
      AND attname IN ('quantity_on_hand','quantity_reserved')
      AND atttypid<>'numeric'::regtype AND NOT attisdropped
  ) OR EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.stock_movements'::regclass
      AND attname='quantity' AND atttypid<>'numeric'::regtype AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'decimal migration postcondition failed: canonical quantity types are inconsistent';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _decimal_stock_views v
    WHERE to_regclass(format('%I.%I',v.nspname,v.relname)) IS NULL
  ) THEN
    RAISE EXCEPTION 'decimal migration postcondition failed: a dependent view was not restored';
  END IF;
END
$migration$;

-- The migration deliberately does not enable the voucher pilot, add access,
-- activate opening balances, seed data, or change RLS policies.

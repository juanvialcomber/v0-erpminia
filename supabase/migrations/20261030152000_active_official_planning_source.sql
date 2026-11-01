-- Only current official planning source is visible. Prior versions preserved as archives.
CREATE OR REPLACE VIEW public.planning_maintenance_priority_v1 WITH (security_invoker=true) AS
WITH latest_planning AS (
         SELECT DISTINCT ON (planning_asset_meter_readings.organization_id, planning_asset_meter_readings.canonical_asset_id, (lower(planning_asset_meter_readings.meter_unit))) planning_asset_meter_readings.organization_id,
            planning_asset_meter_readings.canonical_asset_id,
            lower(planning_asset_meter_readings.meter_unit) AS meter_unit,
            planning_asset_meter_readings.recorded_at,
            planning_asset_meter_readings.meter_value,
            planning_asset_meter_readings.source_kind,
            planning_asset_meter_readings.source_reference
           FROM planning_asset_meter_readings
          ORDER BY planning_asset_meter_readings.organization_id, planning_asset_meter_readings.canonical_asset_id, (lower(planning_asset_meter_readings.meter_unit)), planning_asset_meter_readings.recorded_at DESC, (
                CASE planning_asset_meter_readings.source_kind
                    WHEN 'operational'::text THEN 4
                    WHEN 'workbook_current'::text THEN 3
                    WHEN 'workbook_history'::text THEN 2
                    ELSE 1
                END) DESC
        ), latest_runtime AS (
         SELECT DISTINCT ON (asset_runtime_readings.organization_id, asset_runtime_readings.canonical_asset_id) asset_runtime_readings.organization_id,
            asset_runtime_readings.canonical_asset_id,
            asset_runtime_readings.recorded_at,
            asset_runtime_readings.meter_hours
           FROM asset_runtime_readings
          ORDER BY asset_runtime_readings.organization_id, asset_runtime_readings.canonical_asset_id, asset_runtime_readings.recorded_at DESC
        ), base AS (
         SELECT r.id,
            r.organization_id,
            r.import_id,
            r.source_row,
            r.mine_raw,
            r.asset_name_raw,
            r.meter_unit,
            r.interval_mp,
            r.last_mp,
            r.initial_reading_at,
            r.initial_reading,
            r.current_reading_at,
            r.current_reading,
            r.criticality_raw,
            r.scheduled_date,
            r.programming_status_raw,
            r.responsible_raw,
            r.parts_status_raw,
            r.observations,
            r.workbook_priority_raw,
            r.workbook_action_raw,
            r.row_hash,
            r.canonical_asset_id,
            r.reconciliation_status,
            r.match_method,
            r.match_score,
            r.reconciliation_notes,
            r.created_at,
            r.updated_at,
                CASE lower(COALESCE(r.criticality_raw, ''::text))
                    WHEN 'alta'::text THEN 3
                    WHEN 'media'::text THEN 2
                    WHEN 'baja'::text THEN 1
                    ELSE NULL::integer
                END AS criticality_score,
                CASE
                    WHEN r.interval_mp IS NOT NULL AND r.last_mp IS NOT NULL THEN r.last_mp + r.interval_mp
                    ELSE NULL::numeric
                END AS next_due_meter,
                CASE
                    WHEN lower(COALESCE(r.meter_unit, ''::text)) = 'h'::text AND lr.recorded_at IS NOT NULL AND (lp.recorded_at IS NULL OR lr.recorded_at >= lp.recorded_at) THEN lr.recorded_at
                    ELSE COALESCE(lp.recorded_at, r.current_reading_at)
                END AS effective_current_reading_at,
                CASE
                    WHEN lower(COALESCE(r.meter_unit, ''::text)) = 'h'::text AND lr.recorded_at IS NOT NULL AND (lp.recorded_at IS NULL OR lr.recorded_at >= lp.recorded_at) THEN lr.meter_hours
                    ELSE COALESCE(lp.meter_value, r.current_reading)
                END AS effective_current_reading
           FROM planning_maintenance_source_rows r
             LEFT JOIN latest_planning lp ON lp.organization_id = r.organization_id AND lp.canonical_asset_id = r.canonical_asset_id AND lp.meter_unit = lower(COALESCE(r.meter_unit, ''::text))
             LEFT JOIN latest_runtime lr ON lr.organization_id = r.organization_id AND lr.canonical_asset_id = r.canonical_asset_id
          WHERE r.reconciliation_status = 'matched'::text AND r.canonical_asset_id IS NOT NULL
        ), calc AS (
         SELECT b.id,
            b.organization_id,
            b.import_id,
            b.source_row,
            b.mine_raw,
            b.asset_name_raw,
            b.meter_unit,
            b.interval_mp,
            b.last_mp,
            b.initial_reading_at,
            b.initial_reading,
            b.current_reading_at,
            b.current_reading,
            b.criticality_raw,
            b.scheduled_date,
            b.programming_status_raw,
            b.responsible_raw,
            b.parts_status_raw,
            b.observations,
            b.workbook_priority_raw,
            b.workbook_action_raw,
            b.row_hash,
            b.canonical_asset_id,
            b.reconciliation_status,
            b.match_method,
            b.match_score,
            b.reconciliation_notes,
            b.created_at,
            b.updated_at,
            b.criticality_score,
            b.next_due_meter,
            b.effective_current_reading_at,
            b.effective_current_reading,
                CASE
                    WHEN b.next_due_meter IS NOT NULL AND b.effective_current_reading IS NOT NULL THEN b.next_due_meter - b.effective_current_reading
                    ELSE NULL::numeric
                END AS remaining_meter,
                CASE
                    WHEN b.interval_mp IS NOT NULL AND b.last_mp IS NOT NULL AND b.effective_current_reading IS NOT NULL AND b.interval_mp <> 0::numeric THEN (b.effective_current_reading - b.last_mp) / b.interval_mp
                    ELSE NULL::numeric
                END AS interval_consumed,
                CASE
                    WHEN b.effective_current_reading IS NOT NULL AND b.initial_reading IS NOT NULL AND b.effective_current_reading_at IS NOT NULL AND b.initial_reading_at IS NOT NULL AND b.effective_current_reading_at > b.initial_reading_at THEN GREATEST(0::numeric, (b.effective_current_reading - b.initial_reading) / GREATEST(1::numeric, EXTRACT(epoch FROM b.effective_current_reading_at - b.initial_reading_at) / 86400.0))
                    ELSE NULL::numeric
                END AS utilization_per_day
           FROM base b
        ), projected AS (
         SELECT c.id,
            c.organization_id,
            c.import_id,
            c.source_row,
            c.mine_raw,
            c.asset_name_raw,
            c.meter_unit,
            c.interval_mp,
            c.last_mp,
            c.initial_reading_at,
            c.initial_reading,
            c.current_reading_at,
            c.current_reading,
            c.criticality_raw,
            c.scheduled_date,
            c.programming_status_raw,
            c.responsible_raw,
            c.parts_status_raw,
            c.observations,
            c.workbook_priority_raw,
            c.workbook_action_raw,
            c.row_hash,
            c.canonical_asset_id,
            c.reconciliation_status,
            c.match_method,
            c.match_score,
            c.reconciliation_notes,
            c.created_at,
            c.updated_at,
            c.criticality_score,
            c.next_due_meter,
            c.effective_current_reading_at,
            c.effective_current_reading,
            c.remaining_meter,
            c.interval_consumed,
            c.utilization_per_day,
                CASE
                    WHEN c.next_due_meter IS NOT NULL AND c.effective_current_reading IS NOT NULL AND c.utilization_per_day > 0::numeric AND c.next_due_meter > c.effective_current_reading THEN (c.next_due_meter - c.effective_current_reading) / c.utilization_per_day
                    ELSE NULL::numeric
                END AS projected_days
           FROM calc c
        ), scored AS (
         SELECT p.id,
            p.organization_id,
            p.import_id,
            p.source_row,
            p.mine_raw,
            p.asset_name_raw,
            p.meter_unit,
            p.interval_mp,
            p.last_mp,
            p.initial_reading_at,
            p.initial_reading,
            p.current_reading_at,
            p.current_reading,
            p.criticality_raw,
            p.scheduled_date,
            p.programming_status_raw,
            p.responsible_raw,
            p.parts_status_raw,
            p.observations,
            p.workbook_priority_raw,
            p.workbook_action_raw,
            p.row_hash,
            p.canonical_asset_id,
            p.reconciliation_status,
            p.match_method,
            p.match_score,
            p.reconciliation_notes,
            p.created_at,
            p.updated_at,
            p.criticality_score,
            p.next_due_meter,
            p.effective_current_reading_at,
            p.effective_current_reading,
            p.remaining_meter,
            p.interval_consumed,
            p.utilization_per_day,
            p.projected_days,
                CASE
                    WHEN p.last_mp IS NULL THEN NULL::integer
                    WHEN p.remaining_meter <= 0::numeric THEN 5
                    WHEN p.utilization_per_day > 0::numeric THEN
                    CASE
                        WHEN p.projected_days <= 3::numeric THEN 5
                        WHEN p.projected_days <= 7::numeric THEN 4
                        WHEN p.projected_days <= 14::numeric THEN 3
                        WHEN p.projected_days <= 30::numeric THEN 2
                        ELSE 1
                    END
                    WHEN p.interval_consumed >= 1::numeric THEN 5
                    WHEN p.interval_consumed >= 0.9 THEN 4
                    WHEN p.interval_consumed >= 0.75 THEN 3
                    WHEN p.interval_consumed >= 0.5 THEN 2
                    ELSE 1
                END AS urgency_score
           FROM projected p
        )
 SELECT s.organization_id,
    s.import_id,
    s.id AS source_row_id,
    s.source_row,
    s.canonical_asset_id,
    a.asset_code,
    a.name AS asset_name,
    s.mine_raw,
    s.meter_unit,
    s.interval_mp,
    s.last_mp,
    s.next_due_meter,
    s.initial_reading_at,
    s.initial_reading,
    s.effective_current_reading_at AS current_reading_at,
    s.effective_current_reading AS current_reading,
    s.remaining_meter,
    s.interval_consumed,
    s.utilization_per_day,
    s.projected_days,
        CASE
            WHEN s.projected_days IS NOT NULL AND s.effective_current_reading_at IS NOT NULL THEN s.effective_current_reading_at + make_interval(secs => (s.projected_days * 86400::numeric)::double precision)
            ELSE NULL::timestamp with time zone
        END AS projected_due_at,
    s.criticality_raw,
    s.criticality_score,
    s.urgency_score,
        CASE
            WHEN s.urgency_score IS NOT NULL AND s.criticality_score IS NOT NULL THEN s.urgency_score + s.criticality_score
            ELSE NULL::integer
        END AS total_score,
        CASE
            WHEN s.last_mp IS NULL THEN 'SIN LÍNEA BASE'::text
            WHEN s.remaining_meter <= 0::numeric THEN 'P1 - VENCIDO'::text
            WHEN (s.urgency_score + s.criticality_score) >= 7 THEN 'P2 - INMEDIATO'::text
            WHEN (s.urgency_score + s.criticality_score) >= 6 THEN 'P3 - PROGRAMAR'::text
            WHEN (s.urgency_score + s.criticality_score) >= 4 THEN 'P4 - PLANIFICAR'::text
            ELSE 'P5 - NORMAL'::text
        END AS priority,
        CASE
            WHEN s.last_mp IS NULL THEN 'Establecer MP base y reiniciar control'::text
            WHEN s.remaining_meter <= 0::numeric THEN 'Retirar/programar MP y validar historial'::text
            WHEN (s.urgency_score + s.criticality_score) >= 7 THEN 'Coordinar intervención en <=7 días'::text
            WHEN (s.urgency_score + s.criticality_score) >= 6 THEN 'Ingresar a programación próxima'::text
            WHEN (s.urgency_score + s.criticality_score) >= 4 THEN 'Preparar recursos y ventana de intervención'::text
            ELSE 'Monitoreo normal'::text
        END AS recommended_action,
    s.scheduled_date,
    s.programming_status_raw,
    s.responsible_raw,
    s.parts_status_raw,
    s.observations,
    s.workbook_priority_raw,
    s.workbook_action_raw,
    s.match_method,
    s.match_score,
    i.source_file,
    i.source_file_sha256,
    i.imported_at
   FROM scored s
     JOIN canonical.assets a ON a.id = s.canonical_asset_id AND a.organization_id = s.organization_id
     JOIN planning_maintenance_source_imports i ON i.id = s.import_id
 WHERE i.status <> 'archived';

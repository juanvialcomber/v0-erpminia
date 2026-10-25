export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.6';
const MAX_MESSAGE_CHARS = 8000;

function extractResponseText(payload: any) {
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return typeof payload?.output_text === 'string' ? payload.output_text.trim() : '';
}

async function resolveCargo(context: Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>) {
  const { data: profile } = await context.supabase
    .from('profiles')
    .select('cargo_id')
    .eq('id', context.userId)
    .maybeSingle();
  if (!profile?.cargo_id) return null;
  const { data: cargo } = await context.supabase
    .from('cargos')
    .select('name')
    .eq('id', profile.cargo_id)
    .maybeSingle();
  return cargo?.name || null;
}

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Escribe una consulta de planificación.' }, { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: 'La consulta es demasiado extensa.' }, { status: 400 });

  try {
    const [cargo, priorities, sourceRows, attention, preventive, productionPlan, inventory, purchaseOrders, recentWorkOrders, standardPlans] = await Promise.all([
      resolveCargo(context),
      context.supabase
        .from('planning_maintenance_priority_v1')
        .select('source_row_id,canonical_asset_id,asset_code,asset_name,mine_raw,meter_unit,current_reading_at,current_reading,remaining_meter,utilization_per_day,projected_days,projected_due_at,criticality_raw,total_score,priority,recommended_action,scheduled_date,programming_status_raw,responsible_raw,parts_status_raw')
        .eq('organization_id', context.organizationId)
        .order('total_score', { ascending: false, nullsFirst: false })
        .limit(80),
      context.supabase
        .from('planning_maintenance_source_rows')
        .select('reconciliation_status,mine_raw,meter_unit')
        .eq('organization_id', context.organizationId)
        .limit(500),
      context.supabase
        .from('operational_attention_global_v1')
        .select('domain,alert_key,severity,priority_score,title,evidence_summary,status,affects_operation,material_related,occurred_at,recommended_action')
        .eq('organization_id', context.organizationId)
        .eq('status', 'pending')
        .order('priority_score', { ascending: false })
        .limit(50),
      context.supabase
        .from('preventive_maintenance_hour_status_v1')
        .select('schedule_id,canonical_asset_id,asset_code,asset_name,task_name,due_meter,effective_current_meter,remaining_hours,hour_status,meter_basis_conflict,meter_evidence_source,alert_due')
        .eq('organization_id', context.organizationId)
        .eq('enabled', true)
        .order('remaining_hours', { ascending: true, nullsFirst: false })
        .limit(60),
      context.supabase
        .from('production_monthly_plans')
        .select('id,plan_code,period_start,period_end,status,prepared_by,total_mineral_to_plant_tons,total_waste_tons,total_movement_tons,planned_advance_m,planned_drilling_m')
        .eq('organization_id', context.organizationId)
        .eq('status', 'active')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from('canonical_inventory_current')
        .select('id,sku,name,category,quantity,min_stock,max_stock,snapshot_date,warehouse_code,is_active,validation_status')
        .eq('organization_id', context.organizationId)
        .eq('is_active', true)
        .order('snapshot_date', { ascending: false })
        .limit(250),
      context.supabase
        .from('canonical_purchase_orders_current')
        .select('id,po_number,vendor_name,item_code,item_description,quantity,total_amount,order_date,status,cost_center_code,updated_at')
        .eq('organization_id', context.organizationId)
        .order('updated_at', { ascending: false })
        .limit(250),
      context.supabase
        .from('maintenance_work_orders')
        .select('id,work_order_number,title,work_type,status,canonical_asset_id,total_timer_seconds,root_cause,preventive_actions,closed_at,created_at')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(100),
      context.supabase
        .from('maintenance_standard_job_plans')
        .select('id,plan_code,name,work_type,status,canonical_asset_id,asset_type,estimated_duration_hours,reason,evidence_reference,updated_at')
        .eq('organization_id', context.organizationId)
        .order('updated_at', { ascending: false })
        .limit(100),
    ]);

    const sources = [
      ['planning_maintenance_priority_v1', priorities.error],
      ['planning_maintenance_source_rows', sourceRows.error],
      ['operational_attention_global_v1', attention.error],
      ['preventive_maintenance_hour_status_v1', preventive.error],
      ['production_monthly_plans', productionPlan.error],
      ['canonical_inventory_current', inventory.error],
      ['canonical_purchase_orders_current', purchaseOrders.error],
      ['maintenance_work_orders', recentWorkOrders.error],
      ['maintenance_standard_job_plans', standardPlans.error],
    ] as const;
    const failed = sources.filter(([, error]) => Boolean(error)).map(([source, error]) => ({ source, error: (error as any)?.message || 'error' }));

    const rows = sourceRows.data || [];
    const matched = rows.filter((row: any) => row.reconciliation_status === 'matched').length;
    const pending = rows.length - matched;
    const lowStock = (inventory.data || []).filter((row: any) => {
      const quantity = Number(row.quantity);
      const minStock = row.min_stock == null ? null : Number(row.min_stock);
      return Number.isFinite(quantity) && minStock != null && Number.isFinite(minStock) && quantity <= minStock;
    }).slice(0, 80);
    const openPurchaseOrders = (purchaseOrders.data || []).filter((row: any) => !['closed','cerrada','cerrado','completed','completada','completado','cancelled','cancelada','cancelado','received','recibida','recibido'].includes(String(row.status || '').trim().toLowerCase())).slice(0, 80);


    const existingPlanKeys = new Set(
      (standardPlans.data || []).map((row: any) =>
        [String(row.canonical_asset_id || ''), String(row.work_type || '').toLowerCase()].join('|'),
      ),
    );
    const latestPreventiveByAsset = new Map<string, any>();
    for (const row of recentWorkOrders.data || []) {
      const assetId = String((row as any).canonical_asset_id || '');
      if (!assetId || String((row as any).work_type || '').toLowerCase() !== 'preventive' || !(row as any).closed_at) continue;
      if (!latestPreventiveByAsset.has(assetId)) latestPreventiveByAsset.set(assetId, row);
    }
    const planningRank = new Map([
      ['P1 - VENCIDO', 1],
      ['P2 - INMEDIATO', 2],
      ['P3 - PROGRAMAR', 3],
      ['P4 - PLANIFICAR', 4],
    ]);
    const planCandidates = (priorities.data || [])
      .filter((row: any) => planningRank.has(String(row.priority || '')))
      .map((row: any) => {
        const assetId = String(row.canonical_asset_id || '');
        const evidenceWo = latestPreventiveByAsset.get(assetId);
        if (!evidenceWo) return null;
        const existingKey = [assetId, 'preventive'].join('|');
        if (existingPlanKeys.has(existingKey)) return null;
        const observedSeconds = Number(evidenceWo.total_timer_seconds || 0);
        const observedHours = observedSeconds > 0
          ? Math.round((observedSeconds / 3600) * 100) / 100
          : null;
        const evidenceParts = [
          evidenceWo.work_order_number ? `OT ${evidenceWo.work_order_number}` : null,
          observedHours != null ? `${observedHours} h observadas` : null,
          evidenceWo.closed_at ? `cerrada ${String(evidenceWo.closed_at).slice(0, 10)}` : 'OT aún abierta',
        ].filter(Boolean);
        return {
          canonicalAssetId: assetId,
          assetCode: row.asset_code || null,
          assetName: row.asset_name || null,
          priority: row.priority || null,
          recommendedAction: row.recommended_action || null,
          workType: 'preventivo',
          suggestedName: `Plan · ${evidenceWo.title || 'Mantención preventiva'} · ${row.asset_name || row.asset_code || 'Equipo'}`,
          estimatedDurationHours: observedHours,
          reason: `Candidato desde planificación ${row.priority || ''}; existe evidencia de una OT preventiva real para este equipo.`,
          evidenceReference: evidenceParts.join(' · '),
          sourceWorkOrderNumber: evidenceWo.work_order_number || null,
          sourceWorkOrderTitle: evidenceWo.title || null,
          rank: planningRank.get(String(row.priority || '')) || 99,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.rank - b.rank)
      .slice(0, 3);

    const operationalContext = {
      generated_at: new Date().toISOString(),
      user: {
        name: context.userName || context.userEmail || 'Usuario',
        cargo: cargo || null,
        role: context.role || null,
      },
      data_quality: {
        source_rows: rows.length,
        reconciled: matched,
        pending_reconciliation: pending,
        reconciled_percent: rows.length ? Math.round((matched / rows.length) * 1000) / 10 : 0,
        failed_sources: failed,
      },
      planning_priorities: priorities.data || [],
      attention: attention.data || [],
      preventive: preventive.data || [],
      production_plan: productionPlan.data || null,
      inventory_low_or_min: lowStock,
      purchase_orders_open: openPurchaseOrders,
      recent_work_orders: (recentWorkOrders.data || []).map((row: any) => ({
        work_order_number: row.work_order_number,
        title: row.title,
        work_type: row.work_type,
        status: row.status,
        canonical_asset_id: row.canonical_asset_id,
        observed_duration_hours: Number(row.total_timer_seconds || 0) > 0
          ? Math.round((Number(row.total_timer_seconds) / 3600) * 100) / 100
          : null,
        root_cause: row.root_cause,
        preventive_actions: row.preventive_actions,
        closed_at: row.closed_at,
      })),
      standard_job_plans: standardPlans.data || [],
      semantics: {
        workbook: 'El Excel de Ariel es evidencia y lógica de planificación; no reemplaza el maestro canónico de activos.',
        priority: 'P1-P5 es una regla determinística de planificación, no probabilidad de falla ni diagnóstico.',
        meters: 'Lecturas históricas/importadas deben mantener lineage y no desplazan una lectura operacional posterior.',
        authority: 'Ariel valida programación, ventanas, responsables y correcciones de identidad. El asistente no ejecuta cambios.',
        cross_domain: 'Planificación cruza Mantenimiento, Producción, Bodega y Compras sin tomar propiedad de sus maestros canónicos.',
        standard_plan: 'Un plan estándar es una propuesta reutilizable de pasos, duración, controles y materiales. Nunca debe inferirse como correcto sólo porque una OT histórica existió; Ariel debe revisarlo y aprobarlo antes de aplicación.',
      },
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'El servicio de IA no está configurado en este entorno.' }, { status: 503 });

    const instructions = `Eres el Asistente de Planificación de MOTIL. Tu usuario principal es Ariel López, Jefe de Planificación, aunque debes respetar la identidad de la sesión actual. Trabajas como copiloto operacional transversal de Mantenimiento, Producción, Bodega y Compras.\n\nREGLAS:\n1. Usa únicamente el CONTEXTO OPERACIONAL entregado para afirmar estados, cantidades, prioridades, vencimientos, inventario, compras o producción.\n2. Nunca inventes datos faltantes ni conviertas evidencia Excel no reconciliada en verdad canónica.\n3. Distingue DATO CANÓNICO/DERIVADO, INTERPRETACIÓN y PRÓXIMA ACCIÓN.\n4. P1-P5 ordena planificación humana; no es diagnóstico ni probabilidad de falla.\n5. Si hay datos no reconciliados, conflictos de horómetro o una fuente fallida, indícalo antes de recomendar.\n6. Cruza dependencias: mantenimiento próximo + inventario mínimo + compra abierta + ventana de producción cuando la evidencia lo permita. No asumas relaciones que no estén presentes.\n7. Ariel mantiene autoridad final sobre programación. No crees, cierres, autorices ni modifiques OT, compras, inventario o producción.\n8. Responde corto y accionable: primero qué atender, luego por qué, evidencia y siguiente acción.\n9. Para “qué hago hoy/esta semana”, prioriza P1/P2, bloqueos materiales, conflictos de evidencia, preventivos próximos y dependencias con producción.\n10. Si Ariel pide crear, preparar o proponer planes, entrega máximo 3 PROPUESTAS DE PLAN ESTÁNDAR con: nombre, tipo de trabajo, equipo o alcance, por qué conviene estandarizarlo, duración sugerida sólo si hay evidencia histórica, pasos que puedan inferirse explícitamente de evidencia existente, datos faltantes por validar y referencia de evidencia. Si faltan pasos reales, dilo y no inventes procedimiento.\n11. Prioriza candidatos provenientes de trabajos recurrentes, mantenimiento preventivo/por horas, P1-P4 próximos, o actividades donde una OT histórica ya entregue duración/causa/acción preventiva. Evita convertir correctivos únicos en estándar sin evidencia suficiente.\n12. Antes de sugerir un plan nuevo, revisa los planes estándar existentes para no duplicar.\n13. Ariel mantiene autoridad final: el asistente propone; Ariel crea, corrige, aprueba y programa.\n14. No expongas JSON ni IDs internos salvo que el usuario los pida.`;

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_PLANNING_MODEL || DEFAULT_MODEL,
        instructions,
        input: `CONTEXTO OPERACIONAL MOTIL\n${JSON.stringify(operationalContext)}\n\nPREGUNTA\n${message}`,
        reasoning: { effort: 'medium' },
        max_output_tokens: 2200,
      }),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI respondió ${response.status}`);
    const answer = extractResponseText(payload);
    if (!answer) throw new Error('OpenAI no devolvió texto utilizable');

    return NextResponse.json({
      answer,
      model: payload?.model || process.env.OPENAI_PLANNING_MODEL || DEFAULT_MODEL,
      generatedAt: operationalContext.generated_at,
      coverage: operationalContext.data_quality,
      sources: sources.map(([source]) => source),
      policy: 'READ-only planning copilot: evidencia real → interpretación → acción humana.',
      planCandidates,
    });
  } catch (error) {
    console.error('[planning-assistant] request failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo consultar el asistente de planificación.' }, { status: 503 });
  }
}

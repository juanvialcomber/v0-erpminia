/**
 * N3uralia Intelligence · MOTIL operational canaries v1.
 *
 * Reusable, deterministic, read-only detection contract. Inputs must already
 * be organization-scoped by the calling API. No stock/OT action is executed.
 * Diagnostics are observations, not business decisions or model predictions.
 */
const TERMINAL = new Set(['completed', 'closed', 'cancelled', 'canceled']);

const incident = (code, severity, title, explanation, nextAction, href, evidence, scope = 'maintenance') => ({
  key: 'motil:' + scope + ':' + code + ':' + (evidence?.workOrderId || 'source'),
  code,
  severity,
  title,
  explanation,
  nextAction,
  href,
  evidence: evidence || null,
  authority: 'diagnostic_read_only',
});

const dateMs = (value) => {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const orderHref = (order) => '/dashboard/mantenimiento/ordenes-trabajo/' + encodeURIComponent(String(order.id));

/**
 * @param {{
 *   workOrders?: Array<{
 *     id: string, work_order_number?: string|null, status?: string|null,
 *     timer_status?: string|null, timer_start_time?: string|null,
 *     assigned_person_id?: string|null
 *   }>,
 *   totalWorkOrders?: number|null,
 *   stockSource?: { state:'observed'|'unavailable'|'not_authorized', syncedAt?:string|null },
 *   coreErrorSource?: { state:'observed'|'unavailable'|'not_authorized',
 *     rows?:Array<{error_code?:string|null,created_at?:string|null}>, truncated?:boolean, criticalErrorCount?:number },
 *   now?: string,
 *   maxFindings?: number
 * }} input
 */
export function evaluateMotilOperationalCanaries(input) {
  const now = dateMs(input.now || new Date().toISOString());
  // The capped view must be chosen AFTER global severity ranking, otherwise
  // early P2 rows can conceal a later P1 canonical incident.
  const signals = [];
  const runningByPerson = new Map();
  const orders = Array.isArray(input.workOrders) ? input.workOrders : [];
  const maxFindings = Math.max(1, Math.min(15, Number(input.maxFindings) || 8));
  const total = Number.isInteger(input.totalWorkOrders) && input.totalWorkOrders >= orders.length
    ? input.totalWorkOrders : null;
  const complete = total !== null && total === orders.length;
  // Input is already capped by the caller (1,000 OT and 100 AI errors).
  const add = (signal) => { signals.push(signal); };

  for (const order of orders) {
    const status = String(order.status || '').toLowerCase();
    const timer = String(order.timer_status || '').toLowerCase();
    const evidence = { source: 'maintenance_work_orders', workOrderId: order.id, workOrderNumber: order.work_order_number || null };
    if (TERMINAL.has(status) && ['running', 'paused'].includes(timer)) {
      add(incident('terminal_timer_active', 'P1', 'OT cerrada con cronómetro activo',
        'Una OT terminada conserva un cronómetro activo. Revisar la transición y sus eventos.',
        'Revisar el cierre y el cronómetro de la OT; no corregir horas automáticamente.', orderHref(order), evidence));
      continue;
    }
    if (timer === 'running') {
      const start = dateMs(order.timer_start_time);
      if (start === null || (now !== null && start > now + 5 * 60_000)) {
        add(incident('running_timer_without_valid_start', 'P1', 'Cronómetro sin inicio válido',
          'La OT figura en ejecución, pero la referencia de inicio falta o está en el futuro.',
          'Revisar el evento de inicio y la identidad del ejecutor.', orderHref(order), evidence));
      }
      // Long uninterrupted spans are a review signal, not proof of working
      // hours. Never auto-pause or backfill from calendar elapsed time.
      if (start !== null && now !== null && now >= start) {
        const runningHours = (now - start) / 3_600_000;
        if (runningHours >= 24) {
          const severity = runningHours >= 36 ? 'P1' : 'P2';
          add(incident('long_unpaused_timer', severity, 'Cronómetro activo por más de un día',
            'La OT lleva ' + Math.floor(runningHours) + ' h calendario sin pausa registrada. Eso no demuestra horas efectivas de trabajo.',
            'Planificación coordina la verificación de los tramos reales con el ejecutor y decide cómo proceder, sin sumar automáticamente el tiempo transcurrido.',
            orderHref(order), { ...evidence, runningSince: order.timer_start_time, observedCalendarHours: Math.floor(runningHours) }));
        }
      }
      if (order.assigned_person_id) {
        const existing = runningByPerson.get(order.assigned_person_id);
        if (existing && existing.id !== order.id) {
          add(incident('concurrent_running_work_orders', 'P1', 'Dos OT cronometradas para una persona',
            'Dos órdenes registran un cronómetro activo para el mismo ejecutor.',
            'Revisar ambos cronómetros y detener la duplicidad desde el flujo autorizado.', orderHref(order),
            { ...evidence, conflictingWorkOrderId: existing.id }));
        } else runningByPerson.set(order.assigned_person_id, order);
      }
    } else if (timer === 'paused' && order.timer_start_time) {
      add(incident('paused_timer_has_start', 'P1', 'Cronómetro pausado que conserva inicio',
        'La pausa no dejó el campo de inicio en blanco; podría alterar el tiempo acumulado.',
        'Revisar la pausa y su tiempo registrado antes de reanudar.', orderHref(order), evidence));
    } else if (timer === 'idle' && order.timer_start_time) {
      add(incident('idle_timer_has_start', 'P2', 'Cronómetro detenido con inicio activo',
        'La OT figura detenida, pero conserva un inicio que debería estar vacío.',
        'Verificar el estado del cronómetro antes del siguiente trabajo.', orderHref(order), evidence));
    }
  }

  const source = input.stockSource || { state: 'not_authorized' };
  if (source.state === 'unavailable') {
    add(incident('warehouse_source_unavailable', 'P1', 'Bodega sin información verificable',
      'No se pudo consultar el último corte autorizado de Bodega Central.',
      'Revisar la conexión y el último corte de Laudus; conservar el stock sin cambios.',
      '/dashboard/bodega/verificar-stock', { source: 'bodega_central_stock_canonicalization_summary_v1' }, 'inventory'));
  } else if (source.state === 'observed') {
    const synced = dateMs(source.syncedAt);
    if (synced === null) {
      add(incident('warehouse_source_missing_timestamp', 'P2', 'Bodega sin fecha de sincronización',
        'Hay información disponible, pero no se puede comprobar su vigencia.',
        'Revisar la última sincronización de Laudus antes de comparar conteos físicos.',
        '/dashboard/bodega/verificar-stock', { source: 'bodega_central_stock_canonicalization_summary_v1' }, 'inventory'));
    } else if (now !== null && now - synced > 36 * 3600_000) {
      add(incident('warehouse_source_stale', 'P2', 'Datos de Bodega sin actualización reciente',
        'El último corte sincronizado supera 36 horas; no se puede asumir stock vigente.',
        'Revisar la sincronización Laudus; no modificar existencias automáticamente.',
        '/dashboard/bodega/verificar-stock', { source: 'bodega_central_stock_canonicalization_summary_v1', sourceSyncedAt: source.syncedAt }, 'inventory'));
    }
  }

  const ai = input.coreErrorSource || { state: 'not_authorized' };
  if (ai.state === 'observed' && now !== null) {
    const byCode = new Map();
    for (const row of Array.isArray(ai.rows) ? ai.rows : []) {
      const at = dateMs(row.created_at);
      const code = String(row.error_code || '').trim();
      if (!code || at === null || at > now || now - at > 24 * 3600_000) continue;
      if (!/^[a-z][a-z0-9_]{2,80}$/.test(code)) continue;
      byCode.set(code, (byCode.get(code) || 0) + 1);
    }
    // A separate count-only query protects critical source errors from
    // disappearing behind the newest-100 raw-log reading cap.
    if (Number.isInteger(ai.criticalErrorCount) && ai.criticalErrorCount >= 0) {
      byCode.set('canonical_source_contract_failure', Math.max(
        byCode.get('canonical_source_contract_failure') || 0,
        ai.criticalErrorCount,
      ));
    }
    for (const [code, count] of byCode) {
      const contractFailure = code === 'canonical_source_contract_failure';
      if (count < (contractFailure ? 2 : 3)) continue;
      add(incident('ai_core_repeated_' + code, contractFailure ? 'P1' : 'P2',
        contractFailure ? 'Conexión de datos de inteligencia con errores' : 'Asistente con errores repetidos',
        'N3uralia Intelligence registró ' + count + ' errores del mismo tipo durante las últimas 24 horas.',
        'Revisar el registro técnico y validar la fuente antes de reintentar.',
        '/dashboard/mantenimiento/inteligencia', { source: 'motil_ai_core_errors', errorCode: code, occurrences: count }, 'intelligence'));
    }
  }

  if (ai.state === 'unavailable') {
    add(incident('core_error_source_unavailable', 'P2', 'Observabilidad de IA sin lectura',
      'No se pudieron comprobar los errores recientes del asistente; no implica que haya fallado una acción operacional.',
      'Revisar la fuente de diagnósticos antes de declarar el asistente sin incidentes.',
      '/dashboard/mantenimiento/inteligencia', { source: 'motil_ai_core_errors' }, 'quality'));
  } else if (ai.state === 'observed' && ai.truncated) {
    add(incident('core_error_scan_partial', 'P2', 'Revisión de errores de IA parcial',
      'Se alcanzó el límite de lectura de diagnósticos recientes.',
      'Ampliar la investigación técnica antes de concluir que no hay otros errores.',
      '/dashboard/mantenimiento/inteligencia', { source: 'motil_ai_core_errors', inspected: (ai.rows || []).length }, 'quality'));
  }

  if (!complete) {
    add(incident('work_order_scan_partial', 'P2', 'Revisión preventiva incompleta',
      'La muestra de órdenes no cubre todo el universo; no es posible confirmar ausencia de inconsistencias.',
      'Ampliar la cobertura de lectura y repetir el diagnóstico sin modificar órdenes.',
      '/dashboard/mantenimiento/inteligencia', { source: 'maintenance_work_orders', inspected: orders.length, total }, 'quality'));
  }

  const priority = { P1: 0, P2: 1, P3: 2 };
  signals.sort((a, b) => (priority[a.severity] ?? 3) - (priority[b.severity] ?? 3) || a.key.localeCompare(b.key));
  const findings = signals.slice(0, maxFindings);
  const status = signals.some((row) => row.severity === 'P1') ? 'needs_action'
    : signals.length ? 'review' : complete ? 'no_issues_observed' : 'partial';
  return {
    status,
    findings,
    totalSignals: signals.length,
    truncated: signals.length > findings.length,
    coverage: {
      workOrdersReviewed: orders.length,
      workOrdersTotal: total,
      complete,
      stockSourceChecked: source.state === 'observed',
      coreErrorsChecked: ai.state === 'observed' && !ai.truncated,
      maxFindings,
    },
    policy: {
      operationalMutationExecuted: false,
      sourceAuthority: 'tenant_scoped_read_only',
      noPredictionWithoutEvidence: true,
      noStockAutoAdjustment: true,
      noAutomatedClose: true,
      notAlwaysOn: true,
    },
  };
}

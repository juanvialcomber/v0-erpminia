/**
 * Build a compact, evidence-derived OT clock review for the assignee of an
 * existing MOTIL source-owned task. No new tasks and no times are written.
 * Assignee and tenant authorization must be enforced by the caller.
 */
const OT_REF = /\b(?:OT|OTE)-\d{4}-\d{4}\b/g;
const COMPLETE = new Set(['completed', 'closed']);
const formatHours = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.floor(seconds / 60);
  return Math.floor(minutes / 60) + ' h ' + String(minutes % 60).padStart(2, '0') + ' min';
};

export function extractClockReviewRefs(detail, max = 8) {
  const matches = String(detail || '').toUpperCase().match(OT_REF) || [];
  return [...new Set(matches)].slice(0, Math.max(1, Math.min(8, max)));
}

/**
 * @param {{
 *   task?: {status?: string, detail?:string}|null,
 *   workOrders?: Array<{id:string,work_order_number:string,status:string,timer_status?:string,
 *     timer_start_time?:string|null,total_timer_seconds?:number|null,actual_duration_hours?:number|null,
 *     planned_duration_hours?:number|null}>,
 *   events?: Array<{work_order_id:string,event_type:string,event_at:string,payload?:unknown}>,
 *   eventsComplete?: boolean
 * }} input
 */
export function summarizeClockReview(input) {
  const task = input.task;
  if (!task || task.status === 'done') return { assigned: false, state: 'not_assigned', items: [], totalCases: 0 };
  const refs = extractClockReviewRefs(task.detail);
  if (!refs.length) return { assigned: true, state: 'no_references', items: [], totalCases: 0 };
  const byNumber = new Map((input.workOrders || []).map((order) => [order.work_order_number, order]));
  const events = new Map();
  for (const event of input.events || []) {
    if (typeof event.work_order_id !== 'string') continue;
    const matches = events.get(event.work_order_id) || [];
    matches.push(event);
    events.set(event.work_order_id, matches);
  }

  const cases = [];
  for (const number of refs) {
    const order = byNumber.get(number);
    if (!order) {
      cases.push({
        number, id: null, kind: 'unresolved', label: 'Fuente pendiente de verificar',
        description: 'La referencia de la tarea no tiene una OT canónica legible en este alcance.',
        nextAction: 'Ariel verifica la referencia antes de solicitar una corrección.',
        evidence: { source: 'motil_operational_commitments', orderNumber: number },
      });
      continue;
    }
    const log = events.get(order.id) || [];
    const latest = (kind) => log.filter((e) => e.event_type === kind)
      .sort((a, b) => Date.parse(b.event_at) - Date.parse(a.event_at))[0] || null;
    const pilot = latest('pilot_weekday_duration_calculated');
    const pilotPayload = pilot?.payload && typeof pilot.payload === 'object' && !Array.isArray(pilot.payload) ? pilot.payload : null;
    const estimated = Number(pilotPayload?.estimated_weekday_seconds);
    if (pilotPayload?.status === 'PROVISIONAL'
      && pilotPayload?.pending_mechanic_confirmation === true
      && order.actual_duration_hours == null
      && COMPLETE.has(String(order.status || '').toLowerCase())) {
      cases.push({
        number, id: order.id, kind: 'pilot_estimate', label: 'Estimación de fase piloto',
        description: (formatHours(estimated) || 'Tiempo estimado no disponible') +
          ' de calendario lunes-viernes, con noches incluidas. No son horas efectivas acreditadas.',
        nextAction: 'Ariel contrasta turnos y evidencia, y valida qué horas reales corresponde registrar.',
        evidence: {
          source: 'work_order_events', eventType: pilot.event_type,
          eventAt: pilot.event_at, estimatedWeekdaySeconds: Number.isFinite(estimated) ? estimated : null,
        },
      });
      continue;
    }

    const safety = latest('timer_safety_paused');
    if (safety && order.status === 'in_progress' && order.timer_status === 'paused'
      && !order.timer_start_time) {
      cases.push({
        number, id: order.id, kind: 'safety_pause', label: 'Pausa preventiva de cronómetro',
        description: 'La OT sigue abierta y el cronómetro fue pausado para evitar sumar horas de calendario. Cero registrado no demuestra cero trabajo.',
        nextAction: 'Ariel verifica los tramos ejecutados y determina si corresponde reanudar la OT por el flujo normal.',
        evidence: { source: 'work_order_events', eventType: safety.event_type, eventAt: safety.event_at },
      });
      continue;
    }

    const plays = log.filter((e) => e.event_type === 'timer_play');
    const ends = log.filter((e) => e.event_type === 'timer_terminate');
    const interruptions = log.filter((e) => ['timer_pause', 'timer_resume'].includes(e.event_type));
    const first = plays.length === 1 ? Date.parse(plays[0].event_at) : NaN;
    const last = ends.length === 1 ? Date.parse(ends[0].event_at) : NaN;
    const elapsed = (last - first) / 1000;
    const actual = order.actual_duration_hours == null ? null : Number(order.actual_duration_hours);
    const planned = order.planned_duration_hours == null ? null : Number(order.planned_duration_hours);
    if (COMPLETE.has(String(order.status || '').toLowerCase())
      && plays.length === 1 && ends.length === 1 && interruptions.length === 0
      && Number.isFinite(elapsed) && elapsed >= 12 * 3600
      && actual !== null && actual >= 12 && planned === 0) {
      cases.push({
        number, id: order.id, kind: 'continuous_span', label: 'Cronómetro prolongado sin pausa',
        description: (formatHours(elapsed) || 'Tramo prolongado') +
          ' de reloj continuo y cero horas planificadas. Es un indicio a investigar, no un error demostrado.',
        nextAction: 'Ariel compara la bitácora y los turnos. No rectificar sin evidencia.',
        evidence: { source: 'work_order_events', eventType: 'timer_play/timer_terminate', eventCount: plays.length + ends.length },
      });
    }
  }
  const rank = { safety_pause: 0, pilot_estimate: 1, continuous_span: 2, unresolved: 3 };
  cases.sort((a, b) => (rank[a.kind] ?? 4) - (rank[b.kind] ?? 4) || a.number.localeCompare(b.number));
  return {
    assigned: true,
    state: input.eventsComplete === false ? 'partial' : cases.length ? 'needs_review' : 'no_cases_pending',
    totalCases: cases.length,
    items: cases,
    referenceCount: refs.length,
    reviewOwner: 'maintenance_planning',
    authority: 'read_only_review',
    noAutomaticDurationUpdate: true,
    noMechanicWorkflowChange: true,
  };
}

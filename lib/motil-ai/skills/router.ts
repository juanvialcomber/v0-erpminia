import { MOTIL_CONTEXTUAL_SKILLS, type MotilSkill } from './catalog';

const INTENT_TERMS: Record<string, string[]> = {
  'laudus-source-reconciliation': ['laudus', 'sincronizacion', 'sincronización', 'conciliar fuente', 'dato externo'],
  'inventory-stock-risk': ['stock', 'bodega', 'sin stock', 'faltante', 'reponer', 'repuesto'],
  'procurement-three-way-match': ['three way', '3 way', 'factura', 'recepcion', 'recepción', 'orden de compra', 'oc'],
  'supplier-performance': ['proveedor', 'lead time', 'cumplimiento proveedor', 'desempeño proveedor'],
  'maintenance-cost-trace': ['costo mantenimiento', 'costo ot', 'cuanto costo', 'cuánto costó', 'mano de obra'],
  'asset-financial-360': ['activo 360', 'costo activo', 'historial activo', 'vida util', 'vida útil'],
  'cost-center-control': ['centro de costo', 'centro costo', 'gasto centro'],
  'accounts-payable-exposure': ['cuentas por pagar', 'vencimiento', 'deuda proveedor', 'pagar'],
  'purchase-price-variance': ['precio compra', 'subio precio', 'subió precio', 'variacion precio', 'variación precio'],
  'data-quality-guardian': ['duplicado', 'inconsistencia', 'conflicto', 'dato dudoso', 'calidad dato'],
  'purchase-need-context': ['necesitamos comprar', 'comprar repuesto', 'solicitud compra', 'necesidad compra'],
  'dte-procurement-check': ['dte', 'xml', 'factura sii', 'documento tributario'],
  'inventory-discrepancy-review': ['diferencia stock', 'descuadre inventario', 'conteo bodega', 'stock no cuadra'],
  'supplier-return-resolution': ['devolucion proveedor', 'devolución proveedor', 'nota de credito pendiente', 'nota de crédito pendiente'],
  'maintenance-procurement-urgency': ['repuesto urgente', 'ot detenida por repuesto', 'urgencia compra', 'repuesto critico', 'repuesto crítico'],
  'stock-transfer-opportunity': ['mover stock', 'trasladar stock', 'otra bodega', 'transferencia bodega'],
  'asset-replacement-economics': ['reemplazar activo', 'renovar equipo', 'cambiar equipo', 'costo reemplazo'],
  'cash-impact-maintenance': ['impacto caja mantenimiento', 'flujo caja mantenimiento', 'compromisos mantenimiento'],
  'unit-normalization-review': ['unidad incorrecta', 'unidades distintas', 'unidad compra', 'normalizar unidad'],
  'purchase-request-completeness': ['solicitud incompleta', 'falta centro costo', 'falta justificacion compra', 'falta justificación compra'],
  'work-order-readiness': ['ot lista', 'ot preparada', 'puede ejecutarse la ot', 'bloqueo ot'],
  'maintenance-campaign-readiness': ['campaña mantenimiento', 'campana mantenimiento', 'preparar campaña', 'preparar campana'],
  'critical-spare-lifecycle': ['repuesto critico', 'repuesto crítico', 'compatibilidad repuesto', 'bom equipo'],
  'supplier-concentration-risk': ['dependencia proveedor', 'concentracion proveedor', 'concentración proveedor', 'proveedor unico', 'proveedor único'],
  'invoice-aging-triage': ['facturas por vencer', 'facturas vencidas', 'aging', 'priorizar facturas'],
  'procurement-anomaly-review': ['anomalia compra', 'anomalía compra', 'compra rara', 'duplicado compra', 'precio anormal'],
  'cost-center-anomaly-review': ['anomalia centro costo', 'anomalía centro costo', 'gasto raro centro', 'desvio centro costo', 'desvío centro costo'],
  'supplier-identity-resolution': ['proveedor duplicado', 'mismo proveedor', 'rut proveedor', 'identidad proveedor'],
};

function normalizeIntent(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

export type RoutedSkill = {
  skill: MotilSkill;
  score: number;
  matchedTerms: string[];
};

export function routeMotilSkills(intent: string, maxSkills = 3): RoutedSkill[] {
  const normalized = normalizeIntent(intent);
  const routed: RoutedSkill[] = [];

  for (const skill of MOTIL_CONTEXTUAL_SKILLS) {
    const terms = INTENT_TERMS[skill.key] || [];
    const matchedTerms = terms.filter((term) => normalized.includes(normalizeIntent(term)));
    if (!matchedTerms.length) continue;

    const score = matchedTerms.reduce((sum, term) => sum + Math.max(1, normalizeIntent(term).split(' ').length), 0);
    routed.push({ skill, score, matchedTerms });
  }

  return routed
    .sort((a, b) => b.score - a.score || a.skill.key.localeCompare(b.skill.key))
    .slice(0, Math.max(1, maxSkills));
}

export function routeOrDefault(intent: string): RoutedSkill[] {
  const routed = routeMotilSkills(intent);
  if (routed.length) return routed;
  const fallback = MOTIL_CONTEXTUAL_SKILLS.find((skill) => skill.key === 'data-quality-guardian');
  return fallback ? [{ skill: fallback, score: 0, matchedTerms: [] }] : [];
}

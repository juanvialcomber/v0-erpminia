import type { SkillAvailability } from './availability';

const PROMPTS: Record<string, string> = {
  'laudus-source-reconciliation': '¿Qué datos de Laudus requieren conciliación antes de usarlos?',
  'inventory-stock-risk': '¿Qué stock requiere atención ahora y por qué?',
  'procurement-three-way-match': '¿Qué compras tienen diferencias entre OC, recepción y factura?',
  'supplier-performance': '¿Qué proveedores muestran excepciones relevantes de precio o cumplimiento?',
  'maintenance-cost-trace': '¿Qué está explicando el costo real de mantenimiento?',
  'asset-financial-360': '¿Qué activos concentran mayor costo e historial de mantenimiento?',
  'cost-center-control': '¿Qué centros de costo muestran una variación que debamos revisar?',
  'accounts-payable-exposure': '¿Qué cuentas por pagar requieren atención por vencimiento?',
  'purchase-price-variance': '¿Qué productos muestran variaciones relevantes de precio de compra?',
  'data-quality-guardian': '¿Qué datos requieren revisión antes de usarlos para decidir?',
  'purchase-need-context': '¿Qué necesidades de compra están realmente sustentadas por operación y stock?',
  'dte-procurement-check': '¿Qué DTE no están conciliando bien con compras o facturas?',
  'inventory-discrepancy-review': '¿Dónde hay diferencias de inventario que debamos conciliar?',
  'supplier-return-resolution': '¿Qué devoluciones a proveedor siguen pendientes de resolver?',
  'maintenance-procurement-urgency': '¿Qué OT están expuestas por falta de repuestos o abastecimiento?',
  'stock-transfer-opportunity': '¿Podemos resolver algún faltante moviendo stock entre bodegas?',
  'asset-replacement-economics': '¿Qué activos merecen revisar reparación versus reemplazo?',
  'cash-impact-maintenance': '¿Qué compromisos de mantenimiento impactan más la caja?',
  'unit-normalization-review': '¿Dónde hay unidades incompatibles que bloquean una comparación confiable?',
  'purchase-request-completeness': '¿Qué solicitudes de compra están incompletas antes de avanzar?',
  'work-order-readiness': '¿Qué OT están listas para ejecutarse y cuáles están bloqueadas?',
  'maintenance-campaign-readiness': '¿Qué bloquea la próxima campaña de mantenimiento?',
  'critical-spare-lifecycle': '¿Qué repuestos críticos tienen mayor exposición de stock y compra?',
  'supplier-concentration-risk': '¿Dónde dependemos demasiado de un solo proveedor?',
  'invoice-aging-triage': '¿Qué facturas deberían revisarse primero por vencimiento?',
  'procurement-anomaly-review': '¿Qué compras tienen anomalías de precio, cantidad o duplicidad?',
  'cost-center-anomaly-review': '¿Qué gastos por centro de costo están fuera de patrón?',
  'supplier-identity-resolution': '¿Qué proveedores podrían estar duplicados o mal identificados?',
};

const DOMAIN_PRIORITY: Record<string, string[]> = {
  maintenance: [
    'work-order-readiness',
    'maintenance-procurement-urgency',
    'maintenance-cost-trace',
    'maintenance-campaign-readiness',
    'asset-replacement-economics',
  ],
  inventory: [
    'inventory-stock-risk',
    'stock-transfer-opportunity',
    'critical-spare-lifecycle',
    'inventory-discrepancy-review',
    'purchase-need-context',
  ],
  procurement: [
    'procurement-three-way-match',
    'procurement-anomaly-review',
    'supplier-performance',
    'purchase-price-variance',
    'purchase-request-completeness',
  ],
  finance: [
    'accounts-payable-exposure',
    'invoice-aging-triage',
    'cost-center-control',
    'cash-impact-maintenance',
    'cost-center-anomaly-review',
  ],
  data_health: [
    'data-quality-guardian',
    'unit-normalization-review',
    'supplier-identity-resolution',
    'laudus-source-reconciliation',
  ],
  executive: [
    'maintenance-procurement-urgency',
    'accounts-payable-exposure',
    'inventory-stock-risk',
    'data-quality-guardian',
  ],
};

export function suggestedPromptsForDomain(
  skills: SkillAvailability[],
  domain: string,
  maxPrompts = 3,
): string[] {
  const state = new Map(skills.map((skill) => [skill.key, skill.state]));
  const priority = DOMAIN_PRIORITY[domain] || [];

  const available = priority
    .filter((key) => state.get(key) === 'available')
    .map((key) => PROMPTS[key])
    .filter(Boolean);

  if (available.length >= maxPrompts) return available.slice(0, maxPrompts);

  const degraded = priority
    .filter((key) => state.get(key) === 'degraded')
    .map((key) => PROMPTS[key])
    .filter(Boolean);

  return [...available, ...degraded].slice(0, maxPrompts);
}

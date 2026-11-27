type OperationalEvidence = {
  finance?: { contracts?: Array<Record<string, unknown>> };
  inventory?: { laudus_motil_reconciliation?: { summary?: Record<string, unknown> | null; rows?: Array<Record<string, unknown>> } };
};

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export function deterministicOperationalAnswer(message: string, evidence: OperationalEvidence) {
  const query = normalize(message);
  const contracts = evidence.finance?.contracts || [];
  const reconciliation = evidence.inventory?.laudus_motil_reconciliation;

  if (/\b(contrato|contratos|directorio|proveedor|proveedores)\b/.test(query) && contracts.length) {
    const now = Date.now();
    const expiringOrExpired = contracts.filter((row) => {
      const end = typeof row.end_date === 'string' ? Date.parse(row.end_date) : NaN;
      return Number.isFinite(end) && end <= now + 30 * 86400000;
    });
    const pending = contracts.filter((row) => n(row.contract_value) > n(row.paid_amount));
    const value = contracts.reduce((sum, row) => sum + n(row.contract_value), 0);
    const paid = contracts.reduce((sum, row) => sum + n(row.paid_amount), 0);
    return {
      answer: `Contratos y Directorio: ${contracts.length} registros. Valor registrado ${clp.format(value)}; pagado registrado ${clp.format(paid)}; diferencia registrada ${clp.format(Math.max(value - paid, 0))}. ${pending.length} tienen saldo registrado y ${expiringOrExpired.length} vencen o vencieron dentro de 30 días. Esto no prueba pago bancario, avance físico ni cierre contractual. Siguiente validación humana: revisar los contratos con saldo y su evidencia de factura, pago y avance.`,
      sources: ['contracts'],
      toolsUsed: [{ name: 'read_contracts_directory', mode: 'read' as const }],
    };
  }

  if (/\b(stock|inventario|laudus|conciliacion|diferencia|diferencias)\b/.test(query) && reconciliation) {
    const summary = reconciliation.summary || {};
    const rows = reconciliation.rows || [];
    const mismatches = rows.filter((row) => row.reconciliation_state === 'quantity_mismatch');
    const missing = rows.filter((row) => row.reconciliation_state === 'missing_in_motil');
    return {
      answer: `Conciliación Laudus–MOTIL: ${n(summary.quantity_mismatches) || mismatches.length} diferencias de cantidad y ${n(summary.missing_in_motil_nonzero) || missing.length} posiciones no presentes en MOTIL. La fuente conserva el último corte Laudus ${String(summary.latest_laudus_stock_sync || 'sin fecha')}. Los registros sólo Laudus siguen siendo observaciones de solo lectura y no modifican el stock canónico. Siguiente validación humana: priorizar diferencias con corte comparable y confirmar físicamente las posiciones críticas.`,
      sources: ['laudus_inventory_reconciliation_service_v1', 'laudus_inventory_freshness_summary_service_v1'],
      toolsUsed: [{ name: 'read_laudus_motil_reconciliation', mode: 'read' as const }],
    };
  }

  return null;
}

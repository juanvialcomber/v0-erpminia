// Shared wire contract. Quantities remain decimal strings until PostgreSQL.
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function voucherInput(value) {
  if (!value || !uuid(value.requestId) || !uuid(value.warehouseId) || !uuid(value.workOrderId) || !uuid(value.receiverId)) throw new Error('Selecciona OT, bodega y receptor.');
  const reason = String(value.reason || '').trim();
  if (reason.length < 3 || reason.length > 500) throw new Error('Indica un motivo de 3 a 500 caracteres.');
  if (!Array.isArray(value.lines) || !value.lines.length || value.lines.length > 15) throw new Error('Agrega entre 1 y 15 materiales.');
  const seen = new Set();
  const lines = value.lines.map(line => {
    const quantity = String(line.quantity ?? '').trim().replace(',', '.');
    if (!uuid(line.productId) || seen.has(line.productId) || !/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(quantity) || !/[1-9]/.test(quantity)) throw new Error('Revisa materiales duplicados y cantidades positivas con hasta seis decimales.');
    seen.add(line.productId);
    return { productId: line.productId, quantity };
  });
  return { requestId: value.requestId, warehouseId: value.warehouseId, workOrderId: value.workOrderId, receiverId: value.receiverId, reason, lines };
}

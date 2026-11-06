# Workflow de Control Contractual

## Estados de avance

- `not_started`: 0%.
- `in_progress`: mayor a 0% y menor a 100%.
- `completed`: 100% con evidencia contractual.

El estado de avance no autoriza pago por si solo.

## Estados financieros

- `not_invoiced`: no hay factura informada/verificada.
- `needs_reconciliation`: hay factura fuente pero no existe match exacto Laudus.
- `unpaid`: factura Laudus verificada y sin pago.
- `partial`: pago parcial no explicado completamente por retencion.
- `paid_with_retention`: saldo pendiente coincide con retencion contractual.
- `paid`: saldo material cero o Laudus indica pago completo.

## Excepciones prioritarias

1. Avance > 0 con ninguna factura cuando el contrato deberia facturar por avance.
2. Factura fuente no encontrada en Laudus.
3. OC existente con RUT distinto al proveedor contractual.
4. Pago parcial no explicado por retencion.
5. Contrato ejecutado o facturado con saldo financiero pendiente.
6. Resumen pagado contractual inconsistente con evidencia detallada.
7. Hito/OC vencido o retrasado cuando exista fecha programada verificable.

## Presentacion

Primero mostrar:

`Conclusion -> Siguiente accion`

Luego mostrar:

`Contrato -> Hito/OC -> Avance -> Factura -> Retencion -> Pago -> Evidencia`

Evitar dashboards llenos de cifras sin una accion clara.

## Autoridad humana

- Legal/Elias revisa el significado contractual y las excepciones.
- Gerencia/Finanzas conserva autoridad para confirmar transferencias, aprobaciones y pagos.
- MOTIL puede notificar, conciliar y preparar decision; no ejecuta pagos autonomamente.

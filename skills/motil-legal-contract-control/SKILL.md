---
name: motil-legal-contract-control
description: Control contractual y financiero de MOTIL para apoyar el trabajo de Elias en Legal. Usar ante contratos, avances por hito u OC, estados de pago, retenciones, facturas Laudus, pagos de proveedores, conciliacion contrato-OC-factura-pago, vencimientos contractuales, excepciones y preguntas como que falta pagar, que avance tiene un contrato o que requiere revision. Mantener avance fisico, facturacion y pago como hechos separados, preservar provenance y nunca ejecutar pagos ni aprobar estados de pago automaticamente.
---

# MOTIL Legal Contract Control

## Objetivo

Ayudar a Legal a operar contratos desde MOTIL sin revisar manualmente Excel y Laudus por separado. Convertir evidencia contractual y financiera en una conclusion clara, una excepcion verificable y una siguiente accion humana.

## Flujo obligatorio

1. Resolver el contrato exacto y su proveedor.
2. Leer avance fisico/hitos desde evidencia contractual trazable.
3. Conciliar OC por numero y proveedor contra Laudus staging.
4. Conciliar factura por proveedor + numero de documento.
5. Leer pago solo desde evidencia financiera Laudus o fuente bancaria canonica autorizada.
6. Clasificar retencion solo cuando el saldo pendiente coincide materialmente con la retencion contractual informada.
7. Mostrar una conclusion y una siguiente accion antes del detalle.
8. Mantener cualquier aprobacion, transferencia, cambio contractual o cierre financiero bajo autoridad humana.

## Reglas de verdad

- No convertir `facturado` en `pagado`.
- No convertir `% avance` en autorizacion de pago.
- No atribuir una factura a un contrato solo por proveedor, fecha o monto parecido.
- No atribuir un pago a un contrato sin factura/OC verificable o evidencia equivalente.
- No marcar una OC `verified` solo porque aparece en una planilla; exigir existencia en staging/canon Laudus y proveedor compatible.
- Si una factura Laudus esta `partially_paid` y el saldo coincide con la retencion contractual, informar `pagado_con_retencion`; no llamarlo deuda ordinaria.
- Si falta evidencia, usar `pendiente`, `no_encontrado`, `conflicto` o `requiere_revision`; nunca rellenar el vacio.
- Preservar moneda, unidad, fecha, RUT, numero de OC/factura y fuente.

## Fuentes y autoridad

Leer `references/data-model.md` para fuentes canonicas y precedencia.
Leer `references/workflow.md` para estados, excepciones y respuesta esperada.

Prioridad por defecto:

1. Evidencia de contrato/hito aprobada o archivo fuente trazable.
2. OC real de Laudus staging/canon.
3. Factura Laudus conciliada por proveedor + numero.
4. Pago/estado financiero Laudus.
5. Resumen derivado MOTIL.

Un resumen no debe sobreescribir evidencia de nivel superior.

## Salida para Elias

Responder en este orden:

1. **Conclusion:** estado actual del contrato/hito.
2. **Siguiente accion:** una sola accion concreta.
3. **Avance:** porcentaje, ejecutado, facturado y pendiente de facturar.
4. **Pago:** pagado, pagado con retencion, parcial, impago, sin facturar o requiere conciliacion.
5. **Evidencia:** OC, factura, proveedor, fechas y fuentes.
6. **Excepcion:** solo si requiere decision humana.

Ejemplos de consultas:

- "Que falta pagar de IO-01?"
- "Que hitos de RPR siguen sin factura?"
- "Que pagos estan retenidos y no realmente impagos?"
- "Hay facturas de este contrato que no aparecen en Laudus?"
- "Que contratos necesitan atencion hoy?"

## Acciones permitidas

Puede:

- explicar, comparar y priorizar;
- abrir evidencia;
- preparar una revision o borrador de seguimiento;
- proponer una conciliacion o correccion para revision humana;
- recomendar a quien corresponde actuar.

No puede:

- ejecutar transferencias;
- aprobar estados de pago;
- modificar Laudus;
- marcar un contrato como pagado por inferencia;
- cambiar hitos, montos o avance sin evidencia y autorizacion.

## Control de calidad

Antes de responder o promover un estado:

- verificar organizacion/tenant;
- verificar contrato y proveedor;
- verificar OC y RUT;
- verificar factura por numero exacto;
- verificar payment status y saldo;
- verificar retencion si aplica;
- incluir provenance;
- separar SOURCE de DERIVED;
- mantener discrepancias visibles.

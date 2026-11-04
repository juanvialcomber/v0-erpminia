# MOTIL / Laudus — Matriz de salida operativa

Fecha: 2026-11-04

## Objetivo

Reducir Laudus a una fuente financiera/tributaria y contable de respaldo, consumida automáticamente por MOTIL, evitando que los usuarios tengan que operar el ERP para el trabajo diario.

Regla general:

`MOTIL opera → humano aprueba → Laudus/SII conserva autoridad cuando corresponde → MOTIL concilia automáticamente`

## Política por proceso

| Proceso | Autoridad operativa | Uso de Laudus | Estado objetivo |
|---|---|---|---|
| Solicitud de compra | MOTIL | Ninguno | MOTIL_CANONICAL |
| Cotización y adjudicación | MOTIL + humano | Contraste histórico | MOTIL_CANONICAL |
| Orden de compra operativa | MOTIL | Histórico/contable | MOTIL_CANONICAL |
| Recepción | MOTIL + receptor | Contraste documental | MOTIL_CANONICAL |
| Three-way match | MOTIL | Evidencia nativa read-only | MOTIL_CANONICAL |
| Factura proveedor operativa | MOTIL | Factura/DTE como evidencia | MOTIL_CANONICAL |
| Aprobación para pago | Humano en MOTIL | Read-only | MOTIL_CANONICAL |
| Vencimiento / CxP operativa | MOTIL | Contraste financiero | MOTIL_CANONICAL |
| Registro de pago operacional | Humano en MOTIL | Contraste financiero | MOTIL_CANONICAL |
| Conciliación de pago operacional | Humano en MOTIL | Referencia bancaria/contable | MOTIL_CANONICAL |
| Proveedor 360 | MOTIL | Maestro histórico read-only | MOTIL_CANONICAL |
| Producto / repuesto | MOTIL canónico | Maestro + stock como evidencia | HYBRID |
| Stock ERP | Laudus cuando está fresco y pasa authority gate | Sync automático | LAUDUS_SOURCE / MOTIL_UX |
| Bodega física / conteo | MOTIL + evidencia física | Contraste | MOTIL_CANONICAL |
| Centro de costo operacional | MOTIL | Conciliación con maestro financiero | HYBRID |
| Activo operacional / Ficha 360 | MOTIL | Activo fijo contable como evidencia | MOTIL_CANONICAL |
| Activo fijo / depreciación contable | Laudus | Sync automático | LAUDUS_CANONICAL |
| Contabilidad / libro mayor | Laudus | Sync automático | LAUDUS_CANONICAL |
| DTE / obligación tributaria | SII / sistema autorizado | Evidencia importada | EXTERNAL_CANONICAL |
| Libros y declaraciones tributarias | SII / contabilidad | Read-only en MOTIL | EXTERNAL_CANONICAL |

## Regla de UX

Un usuario operacional no debería abrir Laudus para:

1. crear o seguir una compra;
2. registrar una recepción;
3. revisar una factura contra OC y recepción;
4. aprobar una factura para pago;
5. definir vencimiento;
6. registrar o conciliar un pago operacional;
7. revisar proveedor, activo, centro de costo o evidencia;
8. investigar una inconsistencia Laudus.

Laudus sólo debe aparecer como:

- fuente sincronizada;
- evidencia;
- excepción;
- trazabilidad;
- autoridad contable/tributaria cuando la operación no debe migrarse a MOTIL.

## Dependencias residuales que no se deben reemplazar todavía

- contabilización legal;
- libros contables;
- depreciación contable oficial;
- emisión/registro tributario cuando corresponda;
- funciones cuya escritura en Laudus no tenga aún meses de conciliación estable, autorización explícita y rollback.

## Gate para reducir aún más Laudus

Antes de mover una función desde Laudus a MOTIL:

1. evidencia real de uso;
2. semántica equivalente validada;
3. control humano;
4. auditoría;
5. reconciliación estable;
6. rollback;
7. métricas de errores y cobertura;
8. autorización explícita para cualquier escritura externa.

## Métrica principal

`% de casos operacionales completados en MOTIL sin abrir Laudus`

No confundir con:

- cantidad de endpoints integrados;
- volumen sincronizado;
- monto administrado;
- ahorro económico.

La meta es dependencia operacional menor con autoridad y trazabilidad preservadas.

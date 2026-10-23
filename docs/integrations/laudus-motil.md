# Integración Laudus -> MOTIL

Fecha: 2026-10-22
Estado: integración real activa. Visma/Laudus confirmó el 2026-10-22 que el RUT 84.542.800-K tiene API activa. MOTIL ya ingiere en modo lectura proveedores, productos/bodegas, OC, guías y facturas y ejecuta reconciliación candidate-only sobre staging trazable.
Alcance inicial: solo lectura desde Laudus. Sin escrituras hacia Laudus hasta completar conciliación y UAT.

## Objetivo

Usar Laudus como ERP fuente para maestros y hechos financieros/abastecimiento que mejoren MOTIL, sin duplicar la lógica operacional minera ni convertir Laudus en fuente de verdad para mantenimiento, producción, HSE o geología.

## Contrato técnico Laudus

- API vigente: https://api.laudus.cl
- Autenticación: POST /security/login
- Token: JWT Bearer con expiración.
- Transporte: HTTPS.
- Formatos: JSON/XML; endpoints list también CSV.
- Compresión recomendada: Accept-Encoding: gzip, deflate, br.
- Fechas: ISO8601, asumidas por Laudus en America/Santiago.
- Listados: POST .../list con body de consulta.
- Query body:
  - options.offset / options.limit
  - fields[]
  - filterBy[]
  - orderBy[]
- La API de Laudus está marcada por el proveedor como Beta, pero funcional y con modelo de datos estable.
- La API legacy en erp.laudus.cl/LaudusAPI es solo para desarrollos antiguos y no debe usarse en MOTIL.

## Estado de habilitación

La prueba legacy devolvió error 1056: empresa no habilitada para acceso API.
La opción visual "Habilitar API" está marcada en Laudus, pero falta el aprovisionamiento comercial/backend de Laudus.
No es un error de usuario, password ni de MOTIL hasta que Laudus habilite la empresa del lado servidor.

## Qué ofrece Laudus que sí sirve a MOTIL

### Maestros
- Productos/materiales/servicios
- Proveedores
- Bodegas
- Centros de costo
- Cuentas contables
- Activos fijos
- Empleados/usuarios cuando corresponda

### Compras y abastecimiento
- Solicitudes/órdenes de compra según disponibilidad del endpoint
- Recepciones/guías de compra
- Facturas de proveedor
- Notas de crédito
- Pagos y cuentas por pagar
- Importaciones
- Moneda y condiciones de pago

### Inventario
- Stock por bodega
- Ingresos y salidas
- Traslados
- Inventarios
- Lotes y números de serie cuando estén configurados
- Transformaciones/recetas/procesos en Laudus

### Finanzas
- Asientos/comprobantes
- Plan de cuentas
- Centros de costo
- Movimientos contables
- Conciliación bancaria
- Activo fijo
- Presupuesto e informes, según endpoints expuestos

### Fiscal
- DTE y documentos de compra/venta
- Integración SII propia de Laudus
- Libros y trazabilidad tributaria

## Mapeo a MOTIL

| Laudus | MOTIL destino | Regla |
|---|---|---|
| Productos | canonical.products / canonical_products_v1 | Reconciliar por SKU/código, no sobrescribir identidad canónica sin evidencia |
| Proveedores | canonical.suppliers / canonical_suppliers_v1 | Reconciliar RUT + razón social; preservar ID Laudus externo |
| Centros de costo | canonical.cost_centers | Laudus fuente financiera; MOTIL mantiene contexto operacional |
| Bodegas | warehouses | Mapear bodega externa a bodega MOTIL; no confundir con mina/planta |
| Stock por bodega | warehouse_stock | Snapshot/ledger auditable; nunca reemplazo silencioso |
| Movimientos de stock | stock_movements | Importar como hechos externos con timestamp y source id |
| Órdenes de compra | canonical.purchase_orders | Reconciliar por número/documento/proveedor/fecha |
| Líneas de OC | canonical.purchase_order_lines | Reconciliar SKU, cantidad, unidad, precio y centro costo |
| Facturas proveedor | procurement_supplier_invoices | Base para three-way match, no aprobación automática |
| Líneas factura | procurement_supplier_invoice_lines | Enlazar a OC/recepción con excepciones explícitas |
| Pagos/CxP | procurement_accounts_payable / supplier_payments | Fuente financiera; no disparar pagos desde MOTIL |
| Notas de crédito | procurement_supplier_credit_notes | Aplicar a conciliación, no borrar historia |
| Activo fijo | intelligence/canonical finance assets + reconciliación | Relacionar con canonical.assets solo mediante matching revisable |

## Prioridad de sincronización

### Fase 1 - lectura segura
1. Login y validación de token.
2. Productos.
3. Proveedores.
4. Bodegas.
5. Centros de costo.
6. Stock por bodega.
7. Órdenes de compra + líneas.
8. Facturas proveedor + líneas.
9. Cuentas por pagar/pagos.
10. Activos fijos y contabilidad, después de validar semántica.

### Fase 2 - conciliación
- Mantener external_id, source_system='laudus', source_updated_at, ingested_at.
- No adoptar automáticamente registros conflictivos.
- Usar colas de revisión para:
  - SKU no resuelto
  - proveedor ambiguo
  - centro de costo no mapeado
  - bodega desconocida
  - OC sin recepción
  - factura sin OC
  - diferencias cantidad/precio
  - activo fijo sin asset MOTIL

### Fase 3 - inteligencia
- Three-way match OC -> recepción -> factura.
- Variación de precio por SKU/proveedor.
- Lead time real proveedor.
- Stock crítico vs necesidad de OT.
- Compras por centro de costo/activo/faena.
- Costo real de mantenimiento por activo.
- Cuentas por pagar y exposición de caja relacionadas con mantenimiento.
- Desempeño proveedor usando hechos Laudus + operación MOTIL.

## Qué NO sincronizar automáticamente

- Estados de mantenimiento.
- Cierre o aprobación de OT.
- Disponibilidad de equipos.
- Producción minera/planta.
- HSE/legal.
- Geología.
- Decisiones de compra.
- Pagos.
- Cambios de stock generados por inferencia.

Laudus informa hechos ERP; MOTIL mantiene autoridad operacional y humana.

## Seguridad

- Usuario técnico dedicado Laudus.
- Permisos mínimos de solo lectura para la primera fase.
- Credenciales únicamente server-side.
- Nunca NEXT_PUBLIC.
- Token JWT en memoria/cache server-side con renovación antes de expirar.
- No guardar token en tablas ni logs.
- Rate limiting y backoff.
- Idempotencia por source_system + external_id + versión/fecha.
- Logs sin PII innecesaria ni secretos.

## Estrategia de consumo

- Preferir endpoints /list con paginación.
- Empezar con limit pequeño en smoke tests.
- Sincronización incremental por fecha modificada cuando el modelo lo exponga.
- Si no existe modifiedAt fiable, usar ventanas solapadas + deduplicación por external_id/hash.
- Full snapshot de maestros con baja frecuencia.
- Eventos/transacciones por delta.
- Respetar límites comerciales de llamadas; agrupar campos y paginar eficientemente.

## Gate de activación

No avanzar a ingesta real hasta que:
1. Laudus confirme comercialmente la API habilitada.
2. POST /security/login devuelva JWT.
3. Usuario técnico tenga permisos de solo lectura.
4. Productos/proveedores/bodegas respondan con 200.
5. Se verifique una muestra contra la UI de Laudus con Daniel.
6. Se determine el límite de llamadas contratado para La Patagua.

## Primer smoke test cuando habiliten

- login
- consulta de 5 productos
- consulta de 5 proveedores
- consulta de bodegas
- consulta de centros de costo
- registrar solo métricas de respuesta y IDs externos
- no persistir en tablas canónicas en el primer test

## Decisión de arquitectura

Laudus = fuente ERP financiera/abastecimiento.
MOTIL = sistema operacional minero y capa de inteligencia/reconciliación.
La integración inicial es unidireccional Laudus -> MOTIL.


## Valor generado por MOTIL — 2026-10-23

La integración ya superó la etapa de conectividad. Laudus conserva la autoridad ERP; MOTIL transforma sus datos en control operacional y financiero.

Evidencia actual, ventana de 120 días:
- 2.306 facturas observadas por el motor documental.
- 1.750 facturas tienen al menos una OC candidata.
- 128 relaciones factura -> OC califican como candidato exacto.
- 11 relaciones adicionales califican como probables.
- 222 casos presentan dos o más candidatas fuertes y se mantienen en revisión.
- 556 facturas no tienen OC candidata dentro de la ventana definida.
- El three-way match por línea ya identifica cadenas OC -> recepción -> factura, manteniendo la incertidumbre explícita.

Valor operacional:
1. Reduce búsqueda manual entre documentos de compra.
2. Separa automáticamente casos claros de casos que requieren criterio humano.
3. Detecta ausencia de OC, ambigüedades, diferencias de cantidad/precio y fechas anómalas.
4. Crea trazabilidad reutilizable para Compras, Finanzas, Bodega, Proveedor 360 y posteriormente Activo 360.
5. Permite medir tiempos OC -> recepción -> factura y construir desempeño real de proveedores.

Valor comercial:
- Nivel 1 — Conectividad: MOTIL consulta y normaliza Laudus.
- Nivel 2 — Inteligencia: MOTIL reconcilia, prioriza excepciones y explica evidencia.
- Nivel 3 — Autonomía controlada: MOTIL prepara decisiones/acciones para aprobación humana.

La expansión comercial debe justificarse por capacidades verificadas y resultados observables, no por volumen de tablas o llamadas API.

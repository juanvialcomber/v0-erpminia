# MOTIL — Registro de Valor Generado

Última actualización: 2026-10-23

Este documento registra por qué cada integración o capacidad aumenta el valor económico de MOTIL. No es un changelog técnico. Cada entrada debe conectar dato -> inteligencia -> decisión -> resultado -> capacidad comercial.

## Regla de documentación

Para cada bloque registrar:
1. Fuente/dato conectado.
2. Trabajo o riesgo previo.
3. Procesamiento que agrega MOTIL.
4. Decisión o acción habilitada.
5. Evidencia verificable.
6. Impacto económico medible o hipótesis a medir.
7. Capacidad comercial creada.
8. Próxima medición necesaria.

No convertir hipótesis de ahorro en cifras reales sin medición.

## 2026-10-23 — Laudus / Compras / Finanzas

### Dato conectado
Proveedores, OC, líneas de OC, guías/recepciones, facturas y líneas de factura desde Laudus, preservados como evidencia de integración y sin sobrescribir silenciosamente datos canónicos MOTIL.

### Antes de MOTIL
La información ERP permite registrar transacciones, pero la revisión transversal OC -> recepción -> factura exige buscar y comparar documentos y líneas. Los casos repetitivos, SKU genéricos y compras similares generan ambigüedad que no debe resolverse por igualdad textual simple.

### Inteligencia MOTIL
- Matching documental jerárquico.
- Matching por línea.
- Evidencia por proveedor, producto, cantidad, precio, bodega y tiempo.
- Margen de ambigüedad.
- Cola de excepciones.
- Three-way match candidate-only.
- Separación entre match fuerte, probable, ambiguo, revisión y sin candidato.

### Evidencia actual
Ventana analítica: 120 días.
- Facturas evaluadas: 2.306.
- Facturas con alguna OC candidata: 1.750.
- Match documental exacto: 128.
- Match documental probable: 11.
- Ambigüedad fuerte: 222.
- Sin OC candidata: 556.
- El motor por línea y el motor documental permanecen candidate-only.

### Decisión habilitada
Finanzas/Compras puede empezar por los casos que realmente requieren atención, en vez de inspeccionar el universo completo sin priorización. Los matches fuertes se pueden revisar más rápido; los ambiguos conservan la evidencia que explica por qué el sistema no decidió.

### Impacto económico a medir
- Minutos humanos por factura antes/después.
- % de facturas revisadas sin búsqueda manual.
- Diferencias de precio detectadas antes de pago.
- Documentos sin OC/recepción detectados.
- Lead time OC -> recepción -> factura.
- Tiempo de cierre mensual.
- Concentración y desempeño de proveedor.
- Compras vinculables a OT/activo/centro de costo.

### Capacidad comercial creada
MOTIL deja de ser sólo software operacional conectado a Laudus y pasa a ofrecer una capa de Control Inteligente de Compras y Finanzas. Esta capacidad es separable y valorizable como módulo/inteligencia avanzada, especialmente cuando existan métricas de ahorro verificadas.

### Nivel de madurez
Conectividad: verificada.
Inteligencia: activa en preview.
Autonomía controlada: no activada; requiere feedback humano, evaluación y gates.

### Próximo bloque de valor
Registrar decisiones humanas sobre matches ambiguos y usar ese feedback para mejorar el ranking sin perder trazabilidad. Medir cuántos casos pasan de revisión manual a recomendación de alta confianza.

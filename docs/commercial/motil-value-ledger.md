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


## 2026-10-23 — Bandeja humana de matching Laudus

### Capacidad
Finanzas dispone de una bandeja de una decisión a la vez para confirmar o rechazar la OC sugerida para una factura. El rechazo exige motivo; la aprobación registra por defecto que la coincidencia fue verificada por Finanzas.

### Trazabilidad
Cada decisión conserva organización, factura Laudus, OC candidata, estado del candidato, score, evidencia utilizada, usuario revisor, motivo y timestamp. La decisión es feedback de reconciliación: no modifica Laudus, la factura, la OC ni un pago.

### Valor generado
- Reduce carga cognitiva: una decisión concreta por vez.
- Convierte conocimiento de Finanzas en memoria reutilizable por MOTIL.
- Permite medir tasa de aceptación/rechazo del matcher.
- Crea dataset supervisado propio de La Patagua para mejorar matching futuro.
- Permite demostrar cuánto trabajo de conciliación pasa de búsqueda manual a validación asistida.

### Métricas comerciales a incorporar
- decisiones por usuario/mes;
- tiempo medio por revisión;
- tasa de aceptación por nivel de confianza;
- causas de rechazo más frecuentes;
- reducción de casos ambiguos después de incorporar feedback;
- porcentaje de facturas cuya conciliación requiere intervención humana.

Esta capacidad eleva MOTIL desde inteligencia estática a inteligencia que aprende de la operación, manteniendo autoridad humana.


## 2026-10-23 — Aprendizaje supervisado: fase de calibración

### Diseño
La bandeja prioriza casos ambiguos con menor separación entre las dos mejores candidatas. Esto concentra el tiempo humano donde una etiqueta aporta más información. El pool de revisión se amplió de 12 a 100 candidatos internos, pero la interfaz sigue mostrando sólo 12 pendientes y un caso a la vez.

### Gate de aprendizaje
MOTIL no modifica todavía el score a partir del feedback. Primero exige un mínimo inicial de 20 decisiones humanas para poder observar una señal de calibración. La interfaz muestra progreso de feedback, tasa de aceptación cuando exista y mantiene explícito que el feedback aún no altera el scoring.

### Valor generado
- Evita que la cola se agote artificialmente después de las primeras 12 revisiones.
- Prioriza tiempo experto en casos informativos.
- Crea una métrica verificable de entrenamiento humano.
- Permite medir cuándo existe evidencia suficiente para calibrar el matcher.
- Reduce el riesgo de vender “IA que aprende” antes de tener suficientes etiquetas reales.

### Siguiente evidencia comercial
Cuando existan al menos 20 decisiones, comparar score original contra aceptación humana por tramo de confianza y medir precisión observada. Sólo después evaluar ajustes del ranking.


## 2026-10-23 — Medición del trabajo humano de conciliación

### Instrumentación
La bandeja registra de forma no canónica cuándo un candidato fue mostrado al revisor y, al decidir, calcula el tiempo de revisión. Los rechazos usan motivos estructurados: otra OC, cantidad, precio, bodega, fecha, evidencia insuficiente u otro.

### Valor medible
MOTIL ya puede producir, cuando existan decisiones reales:
- tiempo medio observado por revisión;
- volumen de revisiones medidas;
- tasa de aceptación/rechazo;
- distribución de causas de rechazo;
- precisión observada por tramo de score después del mínimo de calibración.

### Frontera de evidencia
Mientras no existan decisiones humanas reales, el valor permanece E1: volumen/cobertura demostrada. Con tiempos y decisiones observadas pasa a E2. No se afirmará ahorro económico hasta comparar contra un baseline humano real o un ciclo previo comparable.

### Valor comercial
Esta instrumentación permite justificar el módulo de decisión asistida con evidencia operacional propia, no con narrativa. El argumento de precio futuro debe basarse en reducción observada de trabajo manual, excepciones detectadas y recurrencia del beneficio.


## 2026-10-23 — Calibración observable por score

Desde la primera decisión humana, MOTIL separa las revisiones por tramo de score (<70, 70-79, 80-89, 90+) y calcula revisados, aprobados, rechazados y tasa de aceptación. Esto no modifica el algoritmo; sirve para medir si el score realmente representa confianza.

El gate de 20 etiquetas se mantiene antes de proponer recalibración. La medición temprana permite detectar señales sin confundir una muestra pequeña con precisión global.

Valor comercial: permite demostrar con datos si las recomendaciones de alta confianza requieren menos intervención humana y construir una narrativa de decisión asistida basada en desempeño observado.


## 2026-10-23 — Riesgo de abastecimiento conectado a operación

### Investigación y decisión de diseño
La evidencia reciente sobre mantenimiento y provisión de repuestos respalda tratar ambas decisiones de forma conjunta y explícita bajo incertidumbre. MOTIL implementa primero reglas determinísticas y explicables, sin automatizar compras.

### Problema detectado
La vista histórica de repuestos elevaba seis faltantes asociados a una OT ya completada. Esos registros son evidencia histórica, no riesgo vigente. El nuevo motor excluye OT cerradas y sólo considera demanda de mantenimiento cuando existe requerimiento activo > 0.

### Datos conectados
- catálogo canónico: 12.267 productos activos comprables;
- inventario actual y mínimos;
- requerimientos de materiales de OT;
- estado/prioridad de OT;
- compras Laudus de los últimos 365 días;
- historial de proveedores por SKU;
- benchmarks de precio canónicos.

### Evidencia actual
- 89 productos están sin stock y bajo mínimo;
- 196 están bajo mínimo;
- 697 productos con evidencia Laudus tienen historial de proveedor único en la ventana;
- 897 presentan precio reciente >=20% sobre referencia histórica y requieren revisión contextual;
- 0 OT activas presentan hoy faltante de material según la evidencia vigente;
- 7 señales alcanzan score de riesgo alto y 167 riesgo medio;
- 2.723 de 12.267 productos activos comprables tienen match SKU Laudus en la ventana de 365 días (~22%). La cobertura se muestra explícitamente y no se interpreta como ausencia de proveedor.

### Valor generado por MOTIL
MOTIL separa tres preguntas que antes podían confundirse: qué falta hoy, qué abastecimiento está estructuralmente concentrado y qué precios merecen revisión. Además evita convertir requerimientos históricos de OT cerradas en alertas vigentes.

### Valor comercial
Nivel L3 — Inteligencia operacional. El módulo convierte Bodega + Mantenimiento + Laudus en una superficie preventiva de abastecimiento. Puede evolucionar a L4 cuando Compras confirme/descarta señales y esas decisiones se midan.

### Qué falta medir
- acciones de compra originadas por señales;
- tiempo desde alerta a resolución;
- quiebres evitados;
- diferencia de precio validada vs falso positivo;
- recurrencia de proveedor único en materiales efectivamente críticos;
- cobertura SKU Laudus ampliada.


## 2026-10-23 — Proveedor 360 económico-operacional

### Problema previo
Proveedor 360 consolidaba contratos, documentos y desempeño operacional, pero la cobertura de supplier_performance_v1 era insuficiente para representar el universo: actualmente sólo un proveedor presenta evidencia en esa vista. Además, los encabezados de OC Laudus contienen total_amount=0 en múltiples registros, por lo que usar ese campo produciría exposición económica falsa.

### Capacidad implementada
MOTIL calcula una fotografía económica por RUT directamente desde líneas de OC Laudus en una ventana de 365 días:
- número de OC;
- productos distintos;
- exposición económica por suma de line_total;
- productos donde el proveedor es fuente única observada;
- productos con múltiples fuentes;
- variaciones de precio >=20% contra la mediana histórica;
- productos vinculados históricamente a requerimientos de mantenimiento;
- dependencia de mantenimiento activa, cuando exista.

### Evidencia actual
La fuente Laudus contiene 514 proveedores con compras en 365 días. El motor fue validado con un proveedor de alta actividad: 325 OC, 94 productos distintos y 92 productos donde aparece como fuente única observada. Esta concentración no se presenta como criticidad operacional automáticamente.

### Fronteras de confianza
- exposición económica se calcula desde líneas, no desde totales de cabecera;
- proveedor único significa única fuente observada dentro de la ventana, no imposibilidad de comprar a otro;
- variación de precio es señal de revisión, no sobrecosto demostrado;
- sólo un vínculo con OT/activo permite hablar de exposición operacional de mantenimiento.

### Valor generado por MOTIL
Compras puede responder cuánto se compra a un proveedor, en qué productos existe concentración, qué precios cambiaron y si esa relación toca mantenimiento. La ficha deja de ser un directorio documental y se convierte en soporte de decisión.

### Valor comercial
Nivel L3, acercándose a L4. Proveedor 360 se vuelve una capacidad diferenciable de Supplier Intelligence y puede justificar expansión de tarifa cuando se mida uso, decisiones de sourcing y excepciones resueltas.

### Qué falta medir
- proveedores revisados por mes;
- decisiones de diversificación originadas por concentración;
- variaciones de precio validadas;
- ahorro o costo evitado sólo después de una decisión comprobada;
- cobertura adicional de SKU/proveedores;
- vínculos reales a activos críticos.


## 2026-10-23 — Bandeja ejecutiva de decisiones de abastecimiento

### Capacidad
Las señales del motor de riesgo ahora pueden convertirse en decisiones humanas trazables: Revisar, Actuar o No aplica. Actuar exige una acción estructurada (cotizar, diversificar proveedor, validar precio, reponer stock, revisar inventario, revisar mantención u otra). No aplica exige motivo.

### Autoridad
La bandeja no crea OC, no mueve stock, no altera Laudus y no modifica una OT. Registra la decisión humana y conserva un snapshot de la evidencia que la originó.

### Métricas habilitadas
- número de señales revisadas;
- número y tasa de señales que terminan en acción;
- señales descartadas;
- distribución de acciones requeridas;
- evolución del risk score si la misma señal reaparece.

### Valor generado
MOTIL pasa de L3 (detectar/priorizar) a L4 (decisión asistida) en abastecimiento. Compras deja de recibir sólo alertas y dispone de una cola orientada a decisión con evidencia y seguimiento medible.

### Valor comercial
Esta capacidad es un argumento directo para una expansión de tarifa porque incorpora un workflow decisional continuo entre Bodega, Compras, Laudus y Mantenimiento. El precio debe justificarse posteriormente con tasa de uso, acciones derivadas, tiempo de resolución y resultados observados; todavía no con ahorro monetario atribuido.


## 2026-10-23 — Closed loop de abastecimiento: acción -> resultado

### Capacidad
Toda decisión marcada como Actuar puede cerrarse con un resultado humano: Resuelto, Riesgo reducido, Sin cambio o Falso positivo. Al cerrar, MOTIL recalcula el riesgo del producto y guarda un snapshot posterior junto al score original.

### Métricas habilitadas
- acciones abiertas;
- acciones cerradas;
- resultados positivos (resuelto/riesgo reducido);
- falsos positivos;
- tasa de resultado positivo;
- tiempo desde decisión a resultado;
- reducción observada del risk score.

### Frontera de atribución
Una caída del risk score después de una acción no se declara ahorro ni causalidad automática. Es evidencia operacional antes/después. La persona sigue declarando el resultado y MOTIL conserva ambas capas por separado.

### Valor generado
MOTIL cierra por primera vez el ciclo completo de abastecimiento:
señal -> decisión -> acción -> resultado medido.
Esto permite distinguir alertas útiles de ruido y medir si el sistema realmente cambia la operación.

### Valor comercial
Nivel L4 sólido. El módulo deja de ser una superficie de recomendaciones y se convierte en un sistema de gestión y medición de decisiones. Cuando existan resultados reales repetidos, esta capa puede producir evidencia E2/E3 para sostener una revisión de tarifa basada en uso e impacto observado.

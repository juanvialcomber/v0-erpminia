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


## 2026-10-23 — Evidencia de impacto observado

### Capacidad
Después de cerrar un resultado, Compras puede registrar evidencia de impacto: tiempo ahorrado, diferencia de precio validada, quiebre evitado, reducción de riesgo u otro. Se puede adjuntar monto CLP observado, minutos y una referencia trazable.

### Evidencia y madurez
- E2: efecto observado/declarado con explicación.
- E3: efecto observado con referencia documental u operacional.
- Ningún monto se trata como ahorro auditado ni se escribe a contabilidad.

### Valor generado
MOTIL puede acumular evidencia de uso e impacto conectada a una cadena causal documentada:
señal -> decisión -> acción -> resultado -> impacto observado.
Esto permite preparar una negociación de tarifa con evidencia por caso en lugar de una lista de funcionalidades.

### Qué falta antes de usarlo comercialmente
Acumular una muestra suficiente de resultados reales y revisar manualmente los casos monetarios más importantes. Para una afirmación de ROI formal, contrastar baseline, período, recurrencia y atribución.


## 2026-10-23 — Scorecard ejecutivo Valor MOTIL

### Capacidad
Administración dispone de una superficie separada para ver madurez comercial basada en datos reales: conectividad, decisiones asistidas, resultados cerrados e impacto observado.

### Gates iniciales de escala
- 20 revisiones de matching;
- 5 resultados cerrados de abastecimiento;
- 3 impactos E3 con referencia de evidencia.

Estos umbrales son gates internos de adopción, no promesas contractuales ni benchmarks universales.

### Modelo de evidencia
El scorecard separa L4 de producto (capacidad disponible) de E1/E2/E3 de evidencia (grado de demostración). MOTIL puede tener una capacidad avanzada sin afirmar ROI mientras el uso real todavía sea insuficiente.

### Valor comercial
El scorecard permite preparar una conversación de tarifa basada en un dossier vivo: qué procesos están conectados, cuánto se usa la decisión asistida, qué resultados se cierran y qué impacto tiene referencia trazable. La tarifa se defiende con evidencia acumulada, no con número de pantallas.


### Hardening del scorecard
El scorecard ejecutivo se encapsuló en un único RPC backend-only. La API administrativa no consulta directamente tablas del esquema integration ni depende de su exposición Data API. Esto preserva el contrato interno y reduce el riesgo de exposición accidental.


## 2026-10-23 — Snapshots históricos de Valor MOTIL

### Capacidad
MOTIL captura diariamente un snapshot idempotente del scorecard ejecutivo usando fecha de negocio America/Santiago. Se preservan conectividad, decisiones asistidas, resultados, impacto observado, nivel de evidencia y gate comercial.

### Regla de integridad
Los snapshots no recalculan el pasado con información futura. Cada día conserva lo que MOTIL podía demostrar en ese momento. Esto crea un baseline temporal defendible para comparar adopción y resultados.

### Automatización
El job reutiliza CRON_SECRET y la infraestructura de cron existente. La captura está encapsulada en RPC backend-only; usuarios finales no pueden crear ni alterar snapshots.

### Valor comercial
La negociación de tarifa podrá mostrar evolución entre períodos: crecimiento de decisiones asistidas, resultados cerrados, evidencia E3 y madurez del gate. Esto convierte el Value Ledger en una serie histórica reproducible y reduce el riesgo de argumentar valor sólo con fotografías actuales.


## 2026-10-23 — Comparación comercial periódica

### Capacidad
Valor MOTIL ahora compara el último snapshot con el snapshot de hace aproximadamente 30 días cuando existe; si todavía no hay 30 días de historia, usa el primer baseline disponible. La comparación es determinística y no usa generación de lenguaje para inventar beneficios.

### Deltas observados
El scorecard calcula cambios en:
- revisiones de matching;
- decisiones y acciones de abastecimiento;
- resultados cerrados;
- resultados positivos;
- casos E3;
- minutos de impacto observado;
- montos CLP asociados a evidencia observada.

### Narrativa comercial
Sólo se generan afirmaciones cuando el delta es positivo y está presente en snapshots persistidos. Si no existe cambio, la interfaz dice explícitamente que aún no hay delta observado.

### Valor comercial
Esto prepara una conversación mensual de expansión basada en evolución demostrada. El argumento de tarifa puede mostrar cuánto aumentó el uso y la evidencia desde el baseline, sin confundir capacidad instalada con resultado económico.


## 2026-10-23 — Baseline contractual/comercial

Se reconstruyó el alcance enviado a Daniel Villarroel el 4 de mayo de 2026 desde Gmail y sus anexos. El contrato enviado para revisión define explícitamente tres módulos: Mantención y maquinaria, Inventario y Gestión documental; además de diagnóstico, implementación/capacitación, soporte y asesoría. La propuesta comercial es más amplia y presenta Operaciones, Reportes, Cumplimiento, Personas, Seguridad, Medioambiente, Integraciones y acceso multiplataforma.

La copia contractual localizada conserva placeholders del Cliente y no se encontró una versión final firmada en la búsqueda actual. Por eso MOTIL separará contrato explícito, propuesta comercial y capacidad adicional, evitando afirmar jurídicamente que una función está fuera de alcance sin revisar la versión ejecutada.

Valor comercial: Laudus/Compras-Finanzas, matching, Supplier Intelligence, riesgo de abastecimiento, workflows de decisión/resultado e impacto E1-E3 son capacidades claramente superiores al núcleo contractual de tres módulos y deben documentarse como expansión de valor. Las integraciones y áreas funcionales que aparecen sólo de forma genérica en la propuesta se tratarán como ampliaciones específicas, no automáticamente como fuera de alcance.


## 2026-10-23 — MOTIL Intelligence sobre Laudus

### Problema previo
La integración ya exponía volúmenes, matching, proveedores y riesgo de abastecimiento, pero el usuario todavía debía interpretar varias tarjetas técnicas para entender qué requería atención. Además, la tarjeta operacional sumaba categorías de facturas que podían superponerse.

### Investigación aplicada
El trabajo reciente sobre event logs ERP muestra que una representación canónica de proceso permite derivar familias reutilizables de KPIs y comparar comportamiento procure-to-pay sin construir un join distinto para cada métrica. La literatura de anomalías en compras refuerza que el objetivo útil es priorizar casos para revisión y explicar por qué son anómalos, no declarar automáticamente fraude o error.

### Capacidad
Se creó una capa MOTIL Intelligence que combina datos reales de Laudus con matching documental y riesgo de abastecimiento para producir señales explicables con:
- prioridad;
- evidencia;
- interpretación;
- siguiente decisión humana;
- vínculo al módulo donde se revisa.

### Guardrails
Laudus conserva autoridad financiera. La capa es read-only, no aprueba pagos, no crea compras y no modifica Laudus. Fecha de vencimiento de factura no se interpreta como estado de pago. Stock bajo mínimo no se convierte automáticamente en urgencia. Un candidato de matching no se promueve a match canónico.

### Valor
MOTIL deja de ser sólo un visor de registros Laudus y comienza a reducir el universo que una persona debe revisar. La métrica futura es tiempo por decisión, cobertura del universo manual y tasa de aceptación/rechazo de las señales priorizadas.


## 2026-10-23 — Bodega Intelligence

### Problema previo
Bodega podía mostrar stock, mínimos y estados, mientras Laudus aportaba historial económico. El usuario debía cruzar mentalmente disponibilidad, precio, proveedor y mantenimiento. Además, el mínimo registrado no es suficientemente confiable para tratar cada posición bajo mínimo como urgencia operacional.

### Capacidad
Se añadió una proyección read-only que prioriza productos con reglas explicables:
1. demanda o faltante ligado a OT activa;
2. saldo negativo por conciliar;
3. precio Laudus al menos 20% sobre su mediana con historial suficiente;
4. dependencia de un solo proveedor con compras recurrentes.

El estado bajo mínimo por sí solo no eleva una señal a caso prioritario.

### Evidencia
La capa reutiliza `motil_supply_risk_preview` y conserva stock MOTIL, vínculo Laudus, líneas de compra, proveedor, último precio, mediana histórica, última compra y contexto de mantenimiento como evidencia separada.

### Valor
Antes: revisar Bodega y luego buscar historial en Laudus/Compras.
Ahora: MOTIL reduce el universo a productos concretos y explica qué decisión humana corresponde.
Nivel: L3 Inteligencia. La futura transición a L4 requiere capturar decisiones y resultados por caso.

### Qué falta medir
Tiempo de revisión por producto, tasa de casos útiles, tasa de descarte, acciones tomadas y resultados observados.


## 2026-10-23 — Proveedor 360 Intelligence

### Problema previo
Proveedor 360 ya tenía evidencia económica rica —OC, gasto por líneas, productos, fuente única, variaciones de precio y vínculos con mantenimiento— pero el usuario debía interpretar esos indicadores por separado.

### Capacidad
La ficha ahora construye una lectura MOTIL determinística y explicable:
- dependencia operacional activa si existen productos ligados a requerimientos de mantenimiento;
- concentración si hay productos con una sola fuente observada;
- precios a revisar si existen variaciones >=20% con evidencia;
- relación recurrente cuando existe historial suficiente de OC/productos.

Cada señal incluye una siguiente decisión y evita convertir concentración o variación en una acusación automática.

### Valor
Antes: métricas separadas.
Ahora: contexto proveedor -> evidencia -> implicancia -> siguiente revisión.
Nivel: L3 Inteligencia. Se acerca a L4 cuando Compras registre decisiones/acciones sobre estas señales.


## 2026-10-23 — Producto 360 Intelligence con Laudus

### Frontera de fuente verificada
El historial canónico existente en Producto 360 proviene principalmente de archivos Excel históricos, no de Laudus. Se mantuvo esa evidencia separada y se agregó una proyección Laudus específica por SKU.

### Capacidad
Nuevo RPC backend-only `motil_product_laudus_intelligence_preview`:
- stock actual y mínimo como contexto;
- requerimientos de mantenimiento activos;
- líneas de compra Laudus de 365 días;
- proveedores observados y concentración;
- última compra;
- mediana y último precio sólo cuando el SKU es comparable;
- top proveedores y compras recientes;
- señal principal explicable.

### Guardrail descubierto
`Otros004 / Servicios Varios` agrupa compras heterogéneas. La primera prueba mostró miles de líneas y precios no comparables. Se agregó un guard que identifica SKU genérico y desactiva cualquier conclusión de precio, manteniendo sólo historial/provenance.

### Valor
Producto 360 pasa de expediente descriptivo a punto de decisión que junta Bodega + Laudus + Mantención sin mezclar autoridad de fuentes.
Nivel: L3 Inteligencia.


## 2026-10-23 — Activo 360 Economics: puente repuesto -> Laudus

La base actual tiene 0 filas en `work_order_parts`; por lo tanto no existe evidencia suficiente para atribuir compras Laudus a activos. MOTIL no usa centro de costo o similitud textual para fingir esa atribución.

Se agregó `motil_asset_laudus_parts_preview`: Activo -> OT -> repuesto trazado -> producto canónico -> historial Laudus del mismo SKU. La compra Laudus se conserva como contexto del SKU, no como prueba de consumo por el activo. El estado inicial es `material_traceability_required`. TCO y reparar/reemplazar siguen bloqueados hasta tener cobertura suficiente de adquisición, consumo, servicios externos y detención.


## 2026-10-23 — Declaración de materiales por OT

### Problema
El motor ya reservaba stock automáticamente al existir un requerimiento, pero la UX dejaba materiales dentro del detalle técnico. Una OT sin filas podía significar dos cosas distintas: realmente no usa materiales o nadie los declaró. Esa ambigüedad impedía construir economía de activo defendible.

### Cambio
Cada OT moderna puede declarar explícitamente `materials_required = true|false`, con actor y timestamp. La pregunta se muestra en el flujo de ejecución. Agregar un material declara automáticamente que la OT usa materiales; la reserva de stock existente continúa automática vía `refresh_work_order_supply_need`.

### Gate
La aprobación supervisora queda bloqueada si la declaración sigue en NULL. Si la OT declara materiales, debe existir al menos un requerimiento activo. Si declara no usar materiales, no puede mantener requerimientos activos.

### Valor
Esto convierte ausencia de datos en una decisión explícita. Desde ahora, las OT pueden alimentar `work_order_parts` cuando corresponda y distinguir cero consumo real de falta de captura. Es prerrequisito para Activo 360 Economics y futuro reparar vs renovar.


## 2026-10-23 — Gate de materiales en cierre progresivo

La declaración de materiales se incorporó a la cola de cierre como acción explícita. Una OT no puede cerrarse si `materials_required` sigue NULL. Si declara uso de materiales debe tener al menos un requerimiento activo; si declara no usar materiales no puede mantener requerimientos activos.

Esto evita que la brecha se detecte recién en aprobación y transforma la calidad de datos en parte natural del flujo operacional.

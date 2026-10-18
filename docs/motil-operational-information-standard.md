# MOTIL — Estándar de información operacional (2026-10-18)

En todas las áreas con actividad reportada periódicamente verificables, la jerarquía visual de la vista principal es:

1. **Actividad diaria del área** (fuente y hora del suceso y de recepción, texto completo accesible, archivos/evidencia, estado de procesamiento y publicación). Priorizar hoy, después ayer y después anteriores. Mostrar siempre los mensajes recibidos de grupos habilitados, incluso si aún no tienen actividad clasificada; indicar explícitamente «Sin procesar» o «Sin registrar».
2. **Trabajo y decisiones pendientes**: alertas relevantes, revisiones y acciones que el rol puede realizar.
3. **Estado e indicadores oficiales**: cifras con fecha de corte, unidad, cobertura y fuente verificable.
4. **Antecedentes, documentos e histórico**: navegables sin desplazar la operación actual.

## Seguridad de datos

- Distinguir siempre «mensaje recibido» de «actividad interpretada» y «registro oficial».
- No atribuir acciones ni fotos a un equipo por simple proximidad temporal.
- Un mensaje nunca crea por sí mismo órdenes de trabajo, toneladas, movimientos, despachos ni certificaciones.
- No ocultar mensajes cuando falle clasificación o extracción. Mostrar la brecha y facilitar revisión.
- Respetar organización, permisos, grupos habilitados y exclusión de «Mantenimiento MOTIL la patagua».
- Sin fuente actual, mostrar «Sin mensajes recibidos» y el último corte conocido; no inventar tarjetas ni valores.
- Componentes de referencia: `WhatsappOperationalUpdates`, bandeja administrativa `WhatsappSourceRegistry`. Usar el modo del área solo cuando exista una asignación real.
- Conservar el contenido original y enlazar su evidencia de forma privada.

## Adopción

- Geología/Mina, Producción, Planta, Perforación y Despachos: ya tienen bloques de actividad diaria; verificar siempre posición superior, cobertura y permisos.
- Transporte y otras áreas sin fuente WhatsApp propia: primero construir asignación fuente→área comprobable, luego integrar. No reutilizar mensajes de otra área para rellenar una pantalla.
- Antes de liberar: CI completo, preview autenticado escritorio/móvil, prueba sin mensajes, con mensajes sin clasificar y con mensaje publicado, enlace a origen, cortes históricos, y error de fuente.

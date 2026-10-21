# MOTIL WhatsApp — propuesta de distribución (solo revisión)

Fecha revisión: 2026-10-21. Origen: motil_whatsapp_messages. No publicar como datos canónicos ni alterar OT, activos o producción sin validación del usuario operativo.

## Reglas
- Identidad técnica: sender_chat_id. El sender_name es alias, no llave; un remitente puede participar en varios grupos.
- Clasificación a nivel de ítem: remitente + grupo + contenido + fecha de evento + evidencia. No clasificar el mensaje entero a un único módulo cuando contiene varios ítems.
- Distribuir a bandejas de revisión por módulo, con source_message_id único, ordinal de ítem, fecha origen, faena y estado de evidencia. Idempotencia por (organization_id, message_id, item_index, destination_module).
- Estados F/S reportados en mensajes de fechas anteriores: evidencia histórica, nunca estado vigente automático para la Torre. Evitar creación automática de OT o movimientos de inventario.
- Imágenes y videos pendientes: mantener evidencia pendiente sin inventar cifras. Los errores de host no confiable no se evaden.

## Casos comprobados
| message_id | Remitente | Grupo | Faena/contexto | Distribución propuesta | Precaución |
|---|---|---|---|---|---|
| 32144 | Luis Díaz | Planta Patagua | Planta y campamento | Mantenimiento: trabajos recuperativos y preventivos, varios ítems por activo; campamento a instalaciones | Trabajo reportado, no crear OT retroactiva |
| 20227 | Luis Díaz | Planta Patagua | Planta y Peumo | Mantenimiento y bodega; separar intervención bomba CA-1029 en Peumo | Verificar activo/faena y referencias existentes |
| 25654 | Nico M | Grupo 2 | Mina San Pedro | Mina: avance; mantenimiento: jumbo y cargador; Equipos: lecturas horómetro/km y observaciones | Fuga/horómetro defectuoso se registran como observaciones históricas |
| 25510 | Patricio Segura | Grupo 2 | Mina Don Jaime | Mina: viajes y sondajes; Equipos: reporte de estados; Mantenimiento: fallas y cambios de estado históricos | F/S no implica que sigan detenidos ahora; DIAMEC 230 pasa de F/S a operativo entre turnos |
| 25367 | Cmarchant | Grupo 2 | Mina Peumo | Mina y despacho: viajes; equipos y mantenimiento: condiciones y observaciones; sondaje | «Viernes 19/10/2026» requiere validar inconsistencia día-fecha |
| 17082 | Seba | Planta Patagua | Planta | Operación planta: conmutación bombas; bodega: alerta de stock ausente; mantenimiento: desgaste ciclón | En servicio / fuera servicio son secuencia por hora, no estados permanentes |
| 25394 | Seba | Programación Despacho Concentrado CMLP | Despacho | Despacho y laboratorio: ley y humedad por despacho | Datos contenidos en imagen: requiere evidencia extraída |
| 32885 | Seba | Planta Patagua | Planta | Entrega de turno | Fotografía: validar contenido antes de interpretar |
| 27014 | Seba | Planta Patagua | Planta | Entrega de turno y equipos proceso | Fotografía: información contextual, no OT |

## Validación antes de abatir
1. Confirmar sender_chat_id, nombres cambiantes y grupo activo.
2. Clasificar cada parte sin interpretar mensajes de fotografía como texto analizado.
3. Revisar existencia de ítems canónicos y fechas para evitar duplicados.
4. Crear solamente propuestas revisables; exigir aprobación de Ariel para efectos en OT, inventario, planificación, mantenimiento o estados actuales.
5. Confirmar que resumen y feeds reflejan aprobación sin alterar fuentes originales.

## Bloqueos
- 6 fotografías: invalid_download_response.
- 3 videos: untrusted_media_host; no desactivar protección.
- 6 imágenes del grupo Mantenimiento deshabilitado: stored/pending.
- 23 mensajes recientes candidatos de texto/leyenda sin actividad ni actualización de módulo ligada según inspección de 2026-10-21.

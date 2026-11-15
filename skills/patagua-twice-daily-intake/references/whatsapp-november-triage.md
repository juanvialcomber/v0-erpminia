# Triage contextual WhatsApp — noviembre 2026

Fuente: lectura de `motil_whatsapp_messages` en Supabase MOTIL, 15-11-2026. Candidatos sin registro en `motil_whatsapp_module_updates_v1`; **no son datos promovidos**.

| Mensaje | Contexto y contenido | Destino candidato | Control |
|---|---|---|---|
| 534428 | Grupo Planta Patagua, reporte semanal 7-12 nov: inspecciones, compactación, excavadora, camino tranque | Relaves > Javito | Separar período, actividades, observación 'todo normal' no certifica cumplimiento |
| 532319 | Grupo Planta Patagua, trabajos 13 nov: ajustes de chancadores y horno | Mantenimiento / Planta > Chancado | Distinguir intervención realizada y ajustes reportados; no crear OT |
| 530750 | Grupo Planta Patagua, chancado terciario F/S y ajuste de 14/12 a 9/9 | Planta > Chancado | Conservar unidades según fuente; correlacionar 532319 antes de deduplicar |
| 530749 | Grupo Planta Patagua, traslado material a cancha stock | Planta > Movimiento material | Cantidad no informada, no inventar tonelaje |
| 523410 | Grupo Programación Despacho Concentrado CMLP, cuatro camiones previstos | Despacho > Programación | No registrar despacho ejecutado sin guía/peso/salida |
| 522619 | Grupo Planta Patagua, recepción de turno chancado terciario F/S | Planta > Chancado > Turnos | F/S = fuera de servicio en este contexto |
| 521569 | Grupo 2, Mina Don Jaime, viajes y estados de camionetas | Producción > Mina > Don Jaime | Separar viajes de estado de activos; no sumar KPI sin conciliación |
| 520524 | Grupo 2, San Pedro, trabajos 12 nov y programa 13 nov | Producción > Mina > San Pedro | Separar ejecutado y programado |
| 519978 | Grupo 2, Raíz del Cobre, novedades de scoop/dumper | Producción > Mina > Raíz del Cobre; señal secundaria Mantenimiento | Identificar equipo de forma determinística antes de enlazar activo |
| 519977 | Grupo 2, Peumo, siete viajes 12 nov y estados de Hilux | Producción > Mina > Peumo | Viajes reportados no son KPI canónico; no duplicar reparación |
| 510053 | Grupo 2, aviso de leyes del día | Laboratorio/Metalurgia | Buscar fotos adjuntas relacionadas; no inferir leyes |

## Continuación obligatoria
Recuperar el texto completo y episodios vecinos de cada ID, verificar fecha efectiva, adjuntos, remitente y referencias; generar staging idempotente con `source_message_id` y `episode_refs`. Cruzar correo/Excel de mismo turno. QA en preview antes de publicación; nunca sobrescribir indicadores oficiales desde mensajes de WhatsApp.

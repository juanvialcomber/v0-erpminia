export type EventTimeKind = 'completed' | 'planned' | 'status_report' | 'unknown';

export function inferEventTimeKind(text: string, heading = ''): EventTimeKind {
  const input = (heading + ' ' + text).toLocaleLowerCase('es-CL');
  if (/trabajos para hoy|trabajos para manana|trabajos para mañana|viajes para hoy|programado|programada|se realizará/.test(input)) return 'planned';
  if (/trabajos realizados|ayer|se realizó|se reparó|se realizo|se reparo/.test(input)) return 'completed';
  if (/reporte de equipos|estado de los equipos|fuera de servicio|operativo|operativa/.test(input)) return 'status_report';
  return 'unknown';
}

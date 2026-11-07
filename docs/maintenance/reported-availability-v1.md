# MOTIL · Disponibilidad reportada V1

## Objetivo

Calcular una primera disponibilidad defendible para Mina Don Jaime desde el reporte diario de equipos, sin inventar horas programadas ni confundir estado instantáneo con disponibilidad horaria.

## Nombre oficial de la métrica

**Disponibilidad reportada**

No usar `Disponibilidad técnica`, `Disponibilidad mecánica` ni `Disponibilidad operacional` mientras la evidencia sea un snapshot diario y no existan intervalos temporales de detención.

## Fórmula

Por activo y período:

`observaciones disponibles / observaciones clasificables * 100`

Por familia o mina:

`Σ observaciones disponibles / Σ observaciones clasificables * 100`

Nunca promediar porcentajes de equipos.

Cobertura:

`observaciones clasificables reconciliadas / observaciones esperadas * 100`

El universo esperado se construye por `fecha + activo canónico`, incorporando los faltantes de la hoja `Base Equipos`. Un alias reportado sin identidad canónica queda como brecha de reconciliación y no entra al numerador ni al denominador de disponibilidad.

## Estados V1

| Estado fuente | Estado V1 | En disponibilidad |
| --- | --- | --- |
| OPERATIVO | available | sí |
| OPERATIVO + OBS | available | sí |
| EN MANTENCIÓN | unavailable | sí |
| FUERA DE SERVICIO | unavailable | sí |
| STANDBY | review_required | no |
| Sin información / estado desconocido | review_required | no |

### Decisión abierta

`STANDBY` requiere validación de Ariel/Rafael. Hasta entonces se excluye del denominador.

No inferir indisponibilidad desde:
- OT abierta;
- falta de horómetro;
- ausencia de operador;
- falta de información;
- observación de condición si el estado sigue siendo OPERATIVO.

## Fuente y autoridad

Cadena de trazabilidad:

`Gmail -> motil_email_source_manifest -> Excel original -> Fecha del reporte -> fila -> canonical_asset_id -> clasificación -> métrica`

La fecha canónica es la celda interna `Fecha del reporte`, no el nombre del archivo ni la fecha del correo.

Si `source_cutoff_date` del manifiesto contradice la fecha interna, la fuente queda `review_required` y no reemplaza la fuente vigente.

## Identidad

Prioridad de matching:
1. match exacto contra activos ya reconciliados en Programa Maestro;
2. patente chilena única dentro de ese mismo crosswalk;
3. revisión humana.

No usar fuzzy matching para publicar disponibilidad.

Las filas duplicadas de un mismo activo dentro del reporte quedan fuera del denominador hasta revisión.

## Modelo de datos

V1 usa:
- `maintenance_reported_availability_sources`;
- `maintenance_reported_availability_rows`;
- `maintenance_reported_availability_daily_v1`.

No poblar `canonical.asset_availability_daily` con 1.440 minutos inferidos. Esa tabla queda reservada para V2 con tiempo programado y detenciones temporales reales.

## Superficies

### Mantenimiento > Disponibilidad
Mostrar:
- disponibilidad reportada;
- cobertura;
- indisponibles al último corte;
- días con reporte;
- tendencia diaria;
- familia;
- máquina;
- gaps de identidad;
- fuente y fecha de corte.

### Torre de Control
Mostrar Don Jaime sólo cuando exista denominador V1 válido:
- disponibilidad reportada;
- cobertura;
- indisponibles;
- fecha de último corte.

El resto de las minas conserva estado actual sin convertirlo a porcentaje de disponibilidad.

## Gates antes de producción

1. 2.000+ pruebas y build verdes.
2. Migración aplicada en entorno autorizado.
3. Backfill de reportes Don Jaime con hashes/manifiestos conciliados.
4. Numerin recalcula numerador, denominador y cobertura.
5. Validación del significado de STANDBY.
6. QA autenticado de Disponibilidad y Torre.
7. Autorización explícita para merge.
8. Deploy exact-SHA + smoke de producción.

## Evolución V2

Capturar:
- inicio de detención;
- fin de detención;
- tiempo programado;
- planificada/no planificada;
- causa;
- OT vinculada;
- validación humana.

Entonces habilitar:

`Disponibilidad horaria = (minutos programados - minutos indisponibles) / minutos programados * 100`

Sólo con eventos temporales validados habilitar MTBF y MTTR.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadXlsxModule, sheetToMatrix } from '@/lib/xlsx';

type AssetRow = {
  id: string;
  asset_code: string | null;
  name: string | null;
};

type ScheduleRow = {
  id: string;
  asset_id: string | null;
  task_name: string | null;
  frequency_days: number | string | null;
  frequency_hours: number | string | null;
};

type NormalizedRow = {
  assetCode: string;
  assetName: string;
  taskName: string;
  description: string;
  frequencyDays: number | null;
  frequencyHours: number | null;
  lastExecutedDate: string | null;
  nextScheduledDate: string | null;
  estimatedDurationHours: number | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
};

const HEADER_ALIASES = {
  assetCode: ['ASSET_CODE', 'CODIGO_ACTIVO', 'CODIGO_EQUIPO', 'ASSET', 'CODE'],
  assetName: ['ASSET_NAME', 'NOMBRE_ACTIVO', 'NOMBRE_EQUIPO', 'ACTIVO'],
  taskName: ['TASK_NAME', 'NOMBRE_TAREA', 'TAREA', 'MANTENCION'],
  description: ['DESCRIPTION', 'DESCRIPCION', 'DETALLE'],
  frequencyDays: ['FREQUENCY_DAYS', 'FRECUENCIA_DIAS', 'DIAS', 'INTERVALO_DIAS'],
  frequencyHours: ['FREQUENCY_HOURS', 'FRECUENCIA_HORAS', 'HORAS', 'INTERVALO_HORAS'],
  lastExecutedDate: ['LAST_EXECUTED_DATE', 'FECHA_ULTIMA_EJECUCION', 'ULTIMA_EJECUCION'],
  nextScheduledDate: ['NEXT_SCHEDULED_DATE', 'FECHA_PROXIMA', 'PROXIMA_FECHA'],
  estimatedDurationHours: ['ESTIMATED_DURATION_HOURS', 'HORAS_ESTIMADAS', 'DURACION_ESTIMADA'],
  priority: ['PRIORITY', 'PRIORIDAD'],
  enabled: ['ENABLED', 'ACTIVO', 'HABILITADO', 'ESTADO'],
} as const;

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
}

function readCell(row: Record<string, unknown>, aliases: readonly string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizeKey(alias);
    const match = entries.find(([key]) => normalizeKey(key) === target);
    if (match && match[1] !== undefined && match[1] !== null && String(match[1]).trim() !== '') {
      return String(match[1]).trim();
    }
  }
  return '';
}

function toIsoDate(value: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).trim();
  return parsed.toISOString().slice(0, 10);
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalNumber(value: string) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: string) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return !['0', 'false', 'no', 'n', 'off', 'inactivo', 'deshabilitado'].includes(text);
}

function normalizePriority(value: string): 'low' | 'medium' | 'high' | 'critical' {
  const text = String(value || '').trim().toLowerCase();
  if (['low', 'baja'].includes(text)) return 'low';
  if (['high', 'alta'].includes(text)) return 'high';
  if (['critical', 'critica', 'critico'].includes(text)) return 'critical';
  return 'medium';
}

function addDays(dateText: string | null, days: number) {
  const base = dateText ? new Date(dateText) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function normalizeRow(record: Record<string, unknown>): NormalizedRow | null {
  const assetCode = readCell(record, HEADER_ALIASES.assetCode);
  const assetName = readCell(record, HEADER_ALIASES.assetName);
  const taskName = readCell(record, HEADER_ALIASES.taskName);
  const frequencyDaysText = readCell(record, HEADER_ALIASES.frequencyDays);
  const frequencyDays = parseOptionalNumber(frequencyDaysText);
  const frequencyHours = parseOptionalNumber(readCell(record, HEADER_ALIASES.frequencyHours));
  const nextScheduledDate = toIsoDate(readCell(record, HEADER_ALIASES.nextScheduledDate));

  if (!taskName || !((frequencyDays ?? 0) > 0 || (frequencyHours ?? 0) > 0)) return null;

  return {
    assetCode,
    assetName,
    taskName,
    description: readCell(record, HEADER_ALIASES.description),
    frequencyDays,
    frequencyHours,
    lastExecutedDate: toIsoDate(readCell(record, HEADER_ALIASES.lastExecutedDate)) || null,
    nextScheduledDate: nextScheduledDate || null,
    estimatedDurationHours: parseOptionalNumber(readCell(record, HEADER_ALIASES.estimatedDurationHours)),
    priority: normalizePriority(readCell(record, HEADER_ALIASES.priority)),
    enabled: parseBoolean(readCell(record, HEADER_ALIASES.enabled)),
  };
}

function buildScheduleKey(assetId: string, taskName: string, frequencyDays: number | null, frequencyHours: number | null) {
  return `${assetId}::${normalizeKey(taskName)}::d${frequencyDays ?? ''}::h${frequencyHours ?? ''}`;
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Se requiere un archivo' }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.csv') && !filename.endsWith('.xls') && !filename.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Solo se aceptan archivos CSV, XLS o XLSX' }, { status: 400 });
    }

    const xlsx = await loadXlsxModule();
    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) {
      return NextResponse.json({ error: 'El archivo no contiene hojas legibles' }, { status: 400 });
    }

    const rows = sheetToMatrix(xlsx, sheet, false);
    if (rows.length < 2) {
      return NextResponse.json({ error: 'El archivo no contiene filas de datos' }, { status: 400 });
    }

    const headers = rows[0].map((value) => String(value || '').trim());
    const records = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
    const normalizedRows = records.map(normalizeRow).filter((row): row is NormalizedRow => Boolean(row));

    if (normalizedRows.length === 0) {
      return NextResponse.json({ error: 'No se encontraron filas validas para importar' }, { status: 400 });
    }

    const { data: assets, error: assetsError } = await context.supabase
      .from('maintenance_canonical_assets_v1')
      .select('id, asset_code, name')
      .eq('organization_id', context.organizationId)
      .eq('is_active', true);

    if (assetsError) throw assetsError;

    const assetMap = new Map<string, string>();
    (Array.isArray(assets) ? (assets as AssetRow[]) : []).forEach((asset) => {
      if (asset.asset_code) assetMap.set(normalizeKey(asset.asset_code), asset.id);
      if (asset.name) assetMap.set(normalizeKey(asset.name), asset.id);
    });

    const { data: existingSchedules, error: schedulesError } = await context.supabase
      .from('preventive_maintenance_schedules')
      .select('id, canonical_asset_id, task_name, frequency_days, frequency_hours')
      .eq('organization_id', context.organizationId);

    if (schedulesError) throw schedulesError;

    const scheduleMap = new Map<string, ScheduleRow>();
    (Array.isArray(existingSchedules) ? (existingSchedules as ScheduleRow[]) : []).forEach((schedule) => {
      const scheduleAny = schedule as ScheduleRow & { canonical_asset_id?: string | null };
      if (!scheduleAny.canonical_asset_id || !schedule.task_name) return;
      scheduleMap.set(buildScheduleKey(scheduleAny.canonical_asset_id, schedule.task_name, schedule.frequency_days == null ? null : Number(schedule.frequency_days), schedule.frequency_hours == null ? null : Number(schedule.frequency_hours)), schedule);
    });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const issues: string[] = [];

    for (const row of normalizedRows) {
      const assetId = row.assetCode
        ? assetMap.get(normalizeKey(row.assetCode))
        : row.assetName
          ? assetMap.get(normalizeKey(row.assetName))
          : undefined;

      if (!assetId) {
        skipped += 1;
        issues.push(`Activo no encontrado: ${row.assetCode || row.assetName || row.taskName}`);
        continue;
      }

      const nextScheduledDate = row.frequencyDays && row.frequencyDays > 0
        ? row.nextScheduledDate || (row.lastExecutedDate ? addDays(row.lastExecutedDate, row.frequencyDays) : addDays(null, row.frequencyDays))
        : row.nextScheduledDate || null;

      const payload = {
        organization_id: context.organizationId,
        canonical_asset_id: assetId,
        task_name: row.taskName,
        description: row.description || null,
        frequency_days: row.frequencyDays,
        frequency_hours: row.frequencyHours,
        last_executed_date: row.lastExecutedDate,
        next_scheduled_date: nextScheduledDate,
        estimated_duration_hours: row.estimatedDurationHours,
        priority: row.priority,
        enabled: row.enabled,
        updated_at: new Date().toISOString(),
      };

      const existing = scheduleMap.get(buildScheduleKey(assetId, row.taskName, row.frequencyDays, row.frequencyHours));
      if (existing) {
        const { error } = await context.supabase
          .from('preventive_maintenance_schedules')
          .update(payload)
          .eq('id', existing.id)
          .eq('organization_id', context.organizationId);

        if (error) {
          skipped += 1;
          issues.push(`${row.taskName}: ${error.message}`);
          continue;
        }

        updated += 1;
      } else {
        const { error } = await context.supabase
          .from('preventive_maintenance_schedules')
          .insert(payload)
          .select('id')
          .single();

        if (error) {
          skipped += 1;
          issues.push(`${row.taskName}: ${error.message}`);
          continue;
        }

        inserted += 1;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Importacion de planificacion preventiva completada',
      inserted,
      updated,
      skipped,
      total: normalizedRows.length,
      issues,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo importar la planificacion preventiva';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

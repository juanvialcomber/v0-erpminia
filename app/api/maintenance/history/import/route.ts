export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadXlsxModule } from '@/lib/xlsx';

type ImportHistoryRow = {
  asset_code?: string;
  asset_name?: string;
  work_order_number?: string;
  maintenance_type: string;
  performed_by_name?: string;
  start_time?: string;
  end_time?: string;
  parts_replaced?: string;
  parts_cost?: number;
  labor_hours?: number;
  labor_cost?: number;
  notes?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeHeader(value: unknown) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/\./g, '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function pickIndex(headers: string[], variants: string[]) {
  return headers.findIndex((header) => variants.some((variant) => header.includes(variant)));
}

function parseCsvRows(text: string): ImportHistoryRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(normalizeHeader);
  const columns = {
    asset_code: pickIndex(headers, ['asset_code', 'codigo_activo', 'codigo', 'activo']),
    asset_name: pickIndex(headers, ['asset_name', 'nombre_activo', 'nombre']),
    work_order_number: pickIndex(headers, ['work_order_number', 'ot', 'orden_trabajo', 'orden']),
    maintenance_type: pickIndex(headers, ['maintenance_type', 'tipo', 'mantencion']),
    performed_by_name: pickIndex(headers, ['performed_by_name', 'tecnico', 'responsable', 'ejecutado_por']),
    start_time: pickIndex(headers, ['start_time', 'inicio', 'fecha_inicio']),
    end_time: pickIndex(headers, ['end_time', 'fin', 'fecha_fin']),
    parts_replaced: pickIndex(headers, ['parts_replaced', 'repuestos', 'partes']),
    parts_cost: pickIndex(headers, ['parts_cost', 'costo_repuestos', 'repuestos_costo', 'partes_costo']),
    labor_hours: pickIndex(headers, ['labor_hours', 'horas_hombre', 'hh']),
    labor_cost: pickIndex(headers, ['labor_cost', 'costo_mano_obra', 'mano_obra']),
    notes: pickIndex(headers, ['notes', 'observaciones', 'comentarios', 'detalle']),
  };

  return lines.slice(1).flatMap((line) => {
    const values = line.split(';').map(normalizeText);
    const maintenanceType = values[columns.maintenance_type] || '';
    if (!maintenanceType) return [];

    return [
      {
        asset_code: values[columns.asset_code] || '',
        asset_name: values[columns.asset_name] || '',
        work_order_number: values[columns.work_order_number] || '',
        maintenance_type: maintenanceType,
        performed_by_name: values[columns.performed_by_name] || '',
        start_time: parseDate(values[columns.start_time]),
        end_time: parseDate(values[columns.end_time]),
        parts_replaced: values[columns.parts_replaced] || '',
        parts_cost: parseNumber(values[columns.parts_cost]),
        labor_hours: parseNumber(values[columns.labor_hours]),
        labor_cost: parseNumber(values[columns.labor_cost]),
        notes: values[columns.notes] || '',
      },
    ];
  });
}

async function parseWorkbook(file: File) {
  const xlsx = await loadXlsxModule();
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
  if (!rows.length) return [];

  const csvText = [
    rows[0].map((value) => normalizeText(value)).join(';'),
    ...rows.slice(1).map((row) => row.map((value) => normalizeText(value)).join(';')),
  ].join('\n');

  return parseCsvRows(csvText);
}

async function parseImportFile(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsvRows(await file.text());
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) return parseWorkbook(file);
  throw new Error('Formato no soportado. Usa CSV, XLS o XLSX.');
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Se requiere archivo CSV, XLS o XLSX' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No se proporciono archivo', imported: 0, updated: 0 }, { status: 400 });
    }

    const rows = await parseImportFile(file);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No se encontraron registros validos en el archivo', imported: 0, updated: 0 }, { status: 400 });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      let assetId: string | null = null;
      if (row.asset_code) {
        const { data: assetByCode, error: assetCodeError } = await context.supabase
          .from('maintenance_assets')
          .select('id')
          .eq('organization_id', context.organizationId)
          .eq('asset_code', row.asset_code)
          .maybeSingle();
        if (assetCodeError) throw assetCodeError;
        assetId = assetByCode?.id || null;
      }

      if (!assetId && row.asset_name) {
        const { data: assetByName, error: assetNameError } = await context.supabase
          .from('maintenance_assets')
          .select('id')
          .eq('organization_id', context.organizationId)
          .ilike('asset_name', row.asset_name)
          .maybeSingle();
        if (assetNameError) throw assetNameError;
        assetId = assetByName?.id || null;
      }

      let workOrderId: string | null = null;
      if (row.work_order_number) {
        const { data: workOrder, error: workOrderError } = await context.supabase
          .from('maintenance_work_orders')
          .select('id, asset_id')
          .eq('organization_id', context.organizationId)
          .eq('work_order_number', row.work_order_number)
          .maybeSingle();
        if (workOrderError) throw workOrderError;
        workOrderId = workOrder?.id || null;
        assetId = assetId || workOrder?.asset_id || null;
      }

      if (!assetId && !workOrderId) {
        skipped += 1;
        continue;
      }

      const startTime = row.start_time || new Date().toISOString();
      const endTime = row.end_time || startTime;
      const partsCost = row.parts_cost || 0;
      const laborHours = row.labor_hours || 0;
      const laborCost = row.labor_cost || 0;

      const historyPayload = {
        work_order_id: workOrderId,
        asset_id: assetId,
        maintenance_type: row.maintenance_type,
        performed_by_name: row.performed_by_name || null,
        start_time: startTime,
        end_time: endTime,
        parts_replaced: row.parts_replaced || null,
        parts_cost: partsCost,
        labor_hours: laborHours,
        labor_cost: laborCost,
        notes: row.notes || null,
      };

      const lookupBuilder = context.supabase
        .from('maintenance_history')
        .select('id')
        .eq('asset_id', assetId)
        .eq('start_time', startTime);

      const existingQuery = workOrderId ? lookupBuilder.eq('work_order_id', workOrderId) : lookupBuilder.is('work_order_id', null);
      const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
      if (lookupError) throw lookupError;

      if (existing?.id) {
        const { error: updateError } = await context.supabase
          .from('maintenance_history')
          .update(historyPayload)
          .eq('id', existing.id);
        if (updateError) throw updateError;
        updated += 1;
      } else {
        const { error: insertError } = await context.supabase.from('maintenance_history').insert(historyPayload);
        if (insertError) throw insertError;
        imported += 1;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Bitacora de mantenimiento importada correctamente',
      imported,
      updated,
      skipped,
      total: rows.length,
    });
  } catch (error) {
    console.error('[maintenance/history/import]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo importar la bitacora' },
      { status: 500 }
    );
  }
}

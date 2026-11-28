export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadXlsxModule } from '@/lib/xlsx';

type ImportAssetRow = {
  asset_code: string;
  asset_name: string;
  asset_type: string;
  location: string;
  status: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  criticality: string;
  mtbf_hours: number;
  acquisition_cost: number;
};

type AssetExistingRow = {
  id: string;
};

function normalizeText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeAssetCode(value: unknown) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, '');
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

function normalizeStatus(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  if (['inactivo', 'inactive', 'offline', 'fuera de servicio', 'baja'].includes(text)) return 'inactive';
  return 'active';
}

function pickIndex(headers: string[], variants: string[]) {
  return headers.findIndex((header) => variants.some((variant) => header.includes(variant)));
}

function parseCsvRows(text: string): ImportAssetRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(normalizeHeader);
  const columns = {
    asset_code: pickIndex(headers, ['codigo', 'code', 'asset']),
    asset_name: pickIndex(headers, ['nombre', 'name', 'activo']),
    asset_type: pickIndex(headers, ['tipo', 'type']),
    location: pickIndex(headers, ['ubicacion', 'location', 'faena']),
    status: pickIndex(headers, ['estado', 'status']),
    manufacturer: pickIndex(headers, ['fabricante', 'manufacturer', 'marca']),
    model: pickIndex(headers, ['modelo', 'model']),
    serial_number: pickIndex(headers, ['serie', 'serial']),
    criticality: pickIndex(headers, ['criticidad', 'criticality']),
    mtbf_hours: pickIndex(headers, ['mtbf', 'horas entre fallas']),
    acquisition_cost: pickIndex(headers, ['costo', 'valor', 'acquisition']),
  };

  return lines.slice(1).flatMap((line) => {
    const values = line.split(';').map(normalizeText);
    const asset_code = normalizeAssetCode(values[columns.asset_code]);
    const asset_name = values[columns.asset_name] || '';
    if (!asset_code || !asset_name) return [];

    return [
      {
        asset_code,
        asset_name,
        asset_type: values[columns.asset_type] || 'vehiculo',
        location: values[columns.location] || '',
        status: normalizeStatus(values[columns.status]),
        manufacturer: values[columns.manufacturer] || '',
        model: values[columns.model] || '',
        serial_number: values[columns.serial_number] || '',
        criticality: values[columns.criticality] || 'media',
        mtbf_hours: parseNumber(values[columns.mtbf_hours]),
        acquisition_cost: parseNumber(values[columns.acquisition_cost]),
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
  const filename = file.name.toLowerCase();
  if (filename.endsWith('.csv')) {
    return parseCsvRows(await file.text());
  }

  if (filename.endsWith('.xls') || filename.endsWith('.xlsx')) {
    return parseWorkbook(file);
  }

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
      return NextResponse.json({ error: 'No se encontraron activos validos en el archivo', imported: 0, updated: 0 }, { status: 400 });
    }

    let imported = 0;
    let updated = 0;

    for (const row of rows) {
      const payload = {
        organization_id: context.organizationId,
        asset_code: normalizeAssetCode(row.asset_code),
        asset_name: row.asset_name,
        asset_type: row.asset_type,
        location: row.location,
        status: row.status,
        manufacturer: row.manufacturer,
        model: row.model,
        serial_number: row.serial_number,
        criticality: row.criticality,
        mtbf_hours: row.mtbf_hours,
        acquisition_cost: row.acquisition_cost,
      };

      const { data: existing, error: lookupError } = await context.supabase
        .from('maintenance_assets')
        .select('id')
        .eq('organization_id', context.organizationId)
        .eq('asset_code', normalizeAssetCode(row.asset_code))
        .maybeSingle();

      if (lookupError) throw lookupError;

      const typedExisting = existing as AssetExistingRow | null;

      if (typedExisting?.id) {
        const { error } = await context.supabase
          .from('maintenance_assets')
          .update(payload)
          .eq('id', typedExisting.id)
          .eq('organization_id', context.organizationId);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await context.supabase.from('maintenance_assets').insert(payload);
        if (error) throw error;
        imported += 1;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Se procesaron ${rows.length} activos de mantenimiento`,
      imported,
      updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron importar los activos';
    console.error('[maintenance][import-assets] error:', message);
    return NextResponse.json({ error: message, imported: 0, updated: 0 }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadXlsxModule } from '@/lib/xlsx';

type ImportComponentTemplateRow = {
  vehicle_type: string;
  name: string;
  code: string;
  level: number;
  description: string;
  fault_code?: string;
  fault_name?: string;
  severity?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeCode(value: unknown) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, '-');
}

function normalizeHeader(value: unknown) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickIndex(headers: string[], variants: string[]) {
  return headers.findIndex((header) => variants.some((variant) => header.includes(variant)));
}

function parseCsvRows(text: string): ImportComponentTemplateRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(normalizeHeader);
  const columns = {
    vehicle_type: pickIndex(headers, ['vehicle_type', 'tipo_vehiculo', 'tipo vehiculo', 'vehiculo']),
    name: pickIndex(headers, ['name', 'nombre', 'componente']),
    code: pickIndex(headers, ['code', 'codigo']),
    level: pickIndex(headers, ['level', 'nivel']),
    description: pickIndex(headers, ['description', 'descripcion', 'detalle']),
    fault_code: pickIndex(headers, ['fault_code', 'codigo_falla', 'falla codigo']),
    fault_name: pickIndex(headers, ['fault_name', 'nombre_falla', 'falla nombre']),
    severity: pickIndex(headers, ['severity', 'severidad', 'criticidad']),
  };

  return lines.slice(1).flatMap((line) => {
    const values = line.split(';').map(normalizeText);
    const code = normalizeCode(values[columns.code]);
    const name = values[columns.name] || '';
    if (!code || !name) return [];

    return [
      {
        vehicle_type: values[columns.vehicle_type] || 'generico',
        name,
        code,
        level: parseNumber(values[columns.level]),
        description: values[columns.description] || '',
        fault_code: values[columns.fault_code] || '',
        fault_name: values[columns.fault_name] || '',
        severity: values[columns.severity] || '',
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
      return NextResponse.json({ error: 'No se encontraron componentes validos en el archivo', imported: 0, updated: 0 }, { status: 400 });
    }

    let imported = 0;
    let updated = 0;
    let faultModesCreated = 0;

    for (const row of rows) {
      const templatePayload = {
        organization_id: context.organizationId,
        vehicle_type: row.vehicle_type,
        name: row.name,
        code: row.code,
        level: row.level,
        description: row.description,
      };

      const { data: existingTemplate, error: lookupError } = await context.supabase
        .from('components_template')
        .select('id')
        .eq('organization_id', context.organizationId)
        .eq('code', row.code)
        .maybeSingle();

      if (lookupError) throw lookupError;

      let templateId = existingTemplate?.id as string | undefined;
      if (templateId) {
        const { error: updateError } = await context.supabase
          .from('components_template')
          .update(templatePayload)
          .eq('id', templateId);
        if (updateError) throw updateError;
        updated += 1;
      } else {
        const { data: inserted, error: insertError } = await context.supabase
          .from('components_template')
          .insert(templatePayload)
          .select('id')
          .single();
        if (insertError) throw insertError;
        templateId = inserted.id as string;
        imported += 1;
      }

      if (templateId && (row.fault_code || row.fault_name)) {
        const faultPayload = {
          organization_id: context.organizationId,
          component_template_id: templateId,
          fault_code: row.fault_code || row.code,
          fault_name: row.fault_name || row.name,
          severity: row.severity || 'media',
        };

        const { data: existingFaultMode } = await context.supabase
          .from('fault_modes')
          .select('id')
          .eq('component_template_id', templateId)
          .eq('fault_code', faultPayload.fault_code)
          .maybeSingle();

        if (existingFaultMode?.id) {
          const { error: faultUpdateError } = await context.supabase
            .from('fault_modes')
            .update(faultPayload)
            .eq('id', existingFaultMode.id);
          if (faultUpdateError) throw faultUpdateError;
        } else {
          const { error: faultInsertError } = await context.supabase.from('fault_modes').insert(faultPayload);
          if (faultInsertError) throw faultInsertError;
        }
        faultModesCreated += 1;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Componentes mayores importados correctamente',
      imported,
      updated,
      fault_modes: faultModesCreated,
      total: rows.length,
    });
  } catch (error) {
    console.error('[maintenance/componentes-mayores/import]', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'No se pudo importar componentes mayores',
      },
      { status: 500 }
    );
  }
}

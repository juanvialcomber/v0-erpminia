export const dynamic = 'force-dynamic';

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type WorkbookLike = ReturnType<typeof XLSX.read>;
type SheetLike = XLSX.WorkSheet;

type StageRow = {
  organization_id: string;
  import_id: string;
  source_sha256: string;
  source_sheet: string;
  source_row: number;
  record_kind: string;
  asset_class?: string | null;
  description?: string | null;
  acquisition_date?: string | null;
  purchase_month?: number | null;
  historical_asset?: number | null;
  updated_asset?: number | null;
  net_fixed_asset?: number | null;
  historical_accum_depr?: number | null;
  updated_accum_depr?: number | null;
  net_book_value?: number | null;
  depreciation_current?: number | null;
  total_accum_depr?: number | null;
  remaining_life_months?: number | null;
  cost_center_raw?: string | null;
  item_number?: number | null;
  equipment_type?: string | null;
  brand?: string | null;
  model?: string | null;
  model_year?: number | null;
  engine_number?: string | null;
  serial_number?: string | null;
  chassis_number?: string | null;
  license_plate?: string | null;
  insured_uf?: number | null;
  enters_mine?: boolean | null;
  formula_cells: Record<string, string>;
  source_payload: Record<string, unknown>;
  identity_status: 'unresolved' | 'matched';
  canonical_asset_id?: string | null;
  identity_basis?: string | null;
  promoted_to_canonical: false;
};

function roleCanImport(role?: string | null) {
  return ['superadmin', 'admin'].includes(String(role || '').trim().toLowerCase());
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const valueText = String(value).trim();
  return valueText ? valueText : null;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value.replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function integerValue(value: unknown) {
  const numeric = numberValue(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function booleanSiNo(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SÍ' || normalized === 'SI') return true;
  if (normalized === 'NO') return false;
  return null;
}

function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpochUtc = Date.UTC(1899, 11, 30);
    const decoded = new Date(excelEpochUtc + Math.trunc(value) * 86_400_000);
    if (!Number.isNaN(decoded.getTime())) return decoded.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }
  return null;
}

function normalizeIdentifier(value: unknown) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizedDescription(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function normalizeExactCode(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function uniqueExactTextMap<T extends { id: string }>(
  rows: T[],
  selector: (row: T) => unknown,
) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizeExactCode(selector(row));
    if (!key) continue;
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }

  const unique = new Map<string, T>();
  for (const [key, matches] of grouped) {
    if (matches.length === 1) unique.set(key, matches[0]);
  }
  return unique;
}

function uniqueEmbeddedIdentifierMatch<T extends { id: string }>(
  uniqueMap: Map<string, T>,
  haystack: string,
  minLength: number,
) {
  const matches = new Map<string, T>();
  for (const [key, row] of uniqueMap) {
    if (key.length < minLength || !haystack.includes(key)) continue;
    matches.set(row.id, row);
    if (matches.size > 1) return null;
  }
  return matches.size === 1 ? [...matches.values()][0] : null;
}

function materialDifference(actual: number | null, expected: number | null, tolerance = 0.01) {
  if (actual === null || expected === null) return false;
  return Math.abs(actual - expected) > tolerance;
}

function isDepreciationBusinessRow(description: unknown, historicalAsset: unknown) {
  const descriptionText = textValue(description);
  if (!descriptionText || numberValue(historicalAsset) === null) return false;
  const normalized = descriptionText.toUpperCase();

  if (normalized.startsWith('TOTAL')) return false;
  if (/^(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE) 20\d\d$/.test(normalized)) return false;
  if (normalized.includes('CIERRE PERÍODO')) return false;
  if (normalized.startsWith('MES ') || normalized.startsWith('FACTOR')) return false;

  return true;
}

function excelColumnName(column: number) {
  let value = column + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function formulasForRow(sheet: SheetLike, rowNumber: number) {
  const formulas: Record<string, string> = {};
  for (let column = 0; column < 18; column += 1) {
    const columnName = excelColumnName(column);
    const address = `${columnName}${rowNumber}`;
    const cell = sheet[address] as { f?: string } | undefined;
    if (cell?.f) formulas[columnName] = String(cell.f);
  }
  return formulas;
}

function findSheet(workbook: XLSX.WorkBook, name: string) {
  const exact = workbook.SheetNames.find((sheetName) => sheetName === name);
  if (exact) return exact;
  const normalizedTarget = name.trim().toLowerCase();
  return workbook.SheetNames.find((sheetName) => sheetName.trim().toLowerCase() === normalizedTarget) || null;
}

function uniqueIdentifierMap<T extends { id: string }>(
  rows: T[],
  selector: (row: T) => unknown,
) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizeIdentifier(selector(row));
    if (!key) continue;
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }

  const unique = new Map<string, T>();
  for (const [key, matches] of grouped) {
    if (matches.length === 1) unique.set(key, matches[0]);
  }
  return unique;
}

function stageInsuranceWorkbook(params: {
  workbook: WorkbookLike;
  organizationId: string;
  importId: string;
  sourceSha256: string;
  canonicalAssets: Array<{ id: string; serial_number: string | null; license_plate: string | null }>;
}) {
  const { workbook, organizationId, importId, sourceSha256, canonicalAssets } = params;
  const serialMap = uniqueIdentifierMap(canonicalAssets, (asset) => asset.serial_number);
  const plateMap = uniqueIdentifierMap(canonicalAssets, (asset) => asset.license_plate);
  const rows: StageRow[] = [];

  const definitions = [
    {
      sheetName: 'Detalle equipos móviles ',
      kind: 'insured_equipment',
      assetClass: 'equipment',
    },
    {
      sheetName: 'Veh Liv 300452035',
      kind: 'insured_light_vehicle',
      assetClass: 'light_vehicle',
    },
    {
      sheetName: 'Veh Pesad 300451903',
      kind: 'insured_heavy_vehicle',
      assetClass: 'heavy_vehicle',
    },
  ] as const;

  for (const definition of definitions) {
    const actualSheetName = findSheet(workbook, definition.sheetName);
    if (!actualSheetName) throw new Error(`Falta hoja requerida: ${definition.sheetName}`);
    const sheet = workbook.Sheets[actualSheetName] as SheetLike;
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

    for (let index = 0; index < values.length; index += 1) {
      const row = values[index] || [];
      const sourceRow = index + 1;
      const itemNumber = integerValue(row[0]);
      if (itemNumber === null) continue;

      let equipmentType: string | null = null;
      let brand: string | null = null;
      let model: string | null = null;
      let modelYear: number | null = null;
      let engineNumber: string | null = null;
      let serialNumber: string | null = null;
      let chassisNumber: string | null = null;
      let licensePlate: string | null = null;
      let insuredUf: number | null = null;
      let entersMine: boolean | null = null;

      if (definition.kind === 'insured_equipment') {
        equipmentType = textValue(row[1]);
        modelYear = integerValue(row[2]);
        serialNumber = textValue(row[3]);
        engineNumber = textValue(row[4]);
        chassisNumber = textValue(row[5]);
        insuredUf = numberValue(row[6]);
        entersMine = booleanSiNo(row[7]);
        if (!equipmentType || itemNumber < 1 || itemNumber > 91) continue;
      } else {
        equipmentType = textValue(row[1]);
        brand = textValue(row[2]);
        model = textValue(row[3]);
        modelYear = integerValue(row[4]);
        engineNumber = textValue(row[5]);
        serialNumber = textValue(row[6]);
        licensePlate = textValue(row[7]);
        entersMine = booleanSiNo(row[8]);
        if (!equipmentType || modelYear === null) continue;
      }

      const normalizedPlate = normalizeIdentifier(licensePlate);
      const normalizedSerial = normalizeIdentifier(serialNumber);
      const matchedAsset = (normalizedPlate && plateMap.get(normalizedPlate))
        || (normalizedSerial && serialMap.get(normalizedSerial))
        || null;
      const identityBasis = matchedAsset
        ? (normalizedPlate && plateMap.get(normalizedPlate) ? 'license_plate_exact' : 'serial_exact')
        : null;

      rows.push({
        organization_id: organizationId,
        import_id: importId,
        source_sha256: sourceSha256,
        source_sheet: actualSheetName,
        source_row: sourceRow,
        record_kind: definition.kind,
        asset_class: definition.assetClass,
        item_number: itemNumber,
        equipment_type: equipmentType,
        brand,
        model,
        model_year: modelYear,
        engine_number: engineNumber,
        serial_number: serialNumber,
        chassis_number: chassisNumber,
        license_plate: licensePlate,
        insured_uf: insuredUf,
        enters_mine: entersMine,
        formula_cells: {},
        source_payload: {
          source_kind: 'insured_asset_inventory',
          item_number: itemNumber,
        },
        identity_status: matchedAsset ? 'matched' : 'unresolved',
        canonical_asset_id: matchedAsset?.id || null,
        identity_basis: identityBasis,
        promoted_to_canonical: false,
      });
    }
  }

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.record_kind] = (acc[row.record_kind] || 0) + 1;
    return acc;
  }, {});

  if (
    counts.insured_equipment !== 91
    || counts.insured_light_vehicle !== 31
    || counts.insured_heavy_vehicle !== 11
    || rows.length !== 133
  ) {
    throw new Error(`Conteos de seguro inesperados: ${JSON.stringify(counts)} total=${rows.length}`);
  }

  return rows;
}

function stageDepreciationWorkbook(params: {
  workbook: WorkbookLike;
  organizationId: string;
  importId: string;
  sourceSha256: string;
  canonicalAssets: Array<{
    id: string;
    name: string | null;
    serial_number: string | null;
    license_plate: string | null;
    cost_center_code: string | null;
  }>;
}) {
  const { workbook, organizationId, importId, sourceSha256, canonicalAssets } = params;
  const rows: StageRow[] = [];
  const plateMap = uniqueIdentifierMap(canonicalAssets, (asset) => asset.license_plate);
  const serialMap = uniqueIdentifierMap(canonicalAssets, (asset) => asset.serial_number);
  const nameMap = uniqueIdentifierMap(canonicalAssets, (asset) => asset.name);
  const costCenterMap = uniqueExactTextMap(canonicalAssets, (asset) => asset.cost_center_code);
  const definitions = [
    { sheetName: 'ACTIVOS FIJOS Septiembre 2026', kind: 'fixed_asset_owned', costCenterColumn: 43 },
    { sheetName: 'AF USADOS Septiembre 2026', kind: 'fixed_asset_used', costCenterColumn: 19 },
    { sheetName: ' AF LEASING Septiembre  2026', kind: 'fixed_asset_leasing', costCenterColumn: 21 },
  ] as const;

  for (const definition of definitions) {
    const actualSheetName = findSheet(workbook, definition.sheetName);
    if (!actualSheetName) throw new Error(`Falta hoja requerida: ${definition.sheetName}`);
    const sheet = workbook.Sheets[actualSheetName] as SheetLike;
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

    for (let index = 0; index < values.length; index += 1) {
      const row = values[index] || [];
      const sourceRow = index + 1;
      if (!isDepreciationBusinessRow(row[1], row[4])) continue;

      const anomalyWideRow = definition.kind === 'fixed_asset_owned' && sourceRow === 771;
      const description = textValue(row[1]);
      const costCenterRaw = textValue(row[definition.costCenterColumn]);
      const costCenterPrefix = normalizeExactCode(costCenterRaw?.split(/\s+/)[0] || '');
      const identityHaystack = normalizeIdentifier(`${description || ''} ${costCenterRaw || ''}`);
      const descriptionIdentity = normalizeIdentifier(description);
      const costCenterIdentity = normalizeIdentifier(costCenterRaw);

      const costCenterAsset = costCenterPrefix ? costCenterMap.get(costCenterPrefix) || null : null;
      const plateAsset = !costCenterAsset
        ? uniqueEmbeddedIdentifierMatch(plateMap, identityHaystack, 5)
        : null;
      const serialAsset = !costCenterAsset && !plateAsset
        ? uniqueEmbeddedIdentifierMatch(serialMap, identityHaystack, 5)
        : null;
      const nameAsset = !costCenterAsset && !plateAsset && !serialAsset
        ? uniqueEmbeddedIdentifierMatch(
            nameMap,
            `${descriptionIdentity} ${costCenterIdentity}`,
            10,
          )
        : null;
      const matchedAsset = costCenterAsset || plateAsset || serialAsset || nameAsset || null;
      const identityBasis = costCenterAsset
        ? 'cost_center_code_exact'
        : plateAsset
          ? 'license_plate_embedded_exact'
          : serialAsset
            ? 'serial_embedded_exact'
            : nameAsset
              ? 'canonical_name_embedded_exact'
              : null;

      const updatedAsset = numberValue(row[6]);
      const updatedAccumulatedDepreciation = numberValue(row[11]);
      const netBookValue = numberValue(row[12]);
      const currentDepreciation = numberValue(row[15]);
      const totalAccumulatedDepreciation = numberValue(row[16]);
      const reviewFlags: string[] = [];

      if (
        materialDifference(
          netBookValue,
          updatedAsset !== null && updatedAccumulatedDepreciation !== null
            ? updatedAsset - updatedAccumulatedDepreciation
            : null,
        )
      ) {
        reviewFlags.push('net_book_value_mismatch');
      }
      if (
        materialDifference(
          totalAccumulatedDepreciation,
          updatedAccumulatedDepreciation !== null && currentDepreciation !== null
            ? updatedAccumulatedDepreciation + currentDepreciation
            : null,
        )
      ) {
        reviewFlags.push('total_accumulated_depreciation_mismatch');
      }
      if (anomalyWideRow) reviewFlags.push('wide_row_structure');

      rows.push({
        organization_id: organizationId,
        import_id: importId,
        source_sha256: sourceSha256,
        source_sheet: actualSheetName,
        source_row: sourceRow,
        record_kind: definition.kind,
        description,
        acquisition_date: dateValue(row[0]),
        purchase_month: integerValue(row[2]),
        historical_asset: numberValue(row[4]),
        updated_asset: updatedAsset,
        net_fixed_asset: numberValue(row[8]),
        historical_accum_depr: numberValue(row[9]),
        updated_accum_depr: updatedAccumulatedDepreciation,
        net_book_value: netBookValue,
        depreciation_current: currentDepreciation,
        total_accum_depr: totalAccumulatedDepreciation,
        remaining_life_months: numberValue(row[17]),
        cost_center_raw: costCenterRaw,
        formula_cells: formulasForRow(sheet, sourceRow),
        source_payload: {
          source_kind: 'fixed_asset_depreciation_model',
          sender_declared_not_final: true,
          anomaly_wide_row: anomalyWideRow,
          review_flags: reviewFlags,
          economic_identity_method: identityBasis,
        },
        identity_status: matchedAsset ? 'matched' : 'unresolved',
        canonical_asset_id: matchedAsset?.id || null,
        identity_basis: identityBasis,
        promoted_to_canonical: false,
      });
    }
  }

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.record_kind] = (acc[row.record_kind] || 0) + 1;
    return acc;
  }, {});

  if (
    counts.fixed_asset_owned !== 739
    || counts.fixed_asset_used !== 77
    || counts.fixed_asset_leasing !== 64
    || rows.length !== 880
  ) {
    throw new Error(`Conteos de depreciación inesperados: ${JSON.stringify(counts)} total=${rows.length}`);
  }

  return rows;
}

export async function POST(
  request: NextRequest,
  contextParams: { params: Promise<{ id: string }> },
) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!roleCanImport(context.role)) {
    return NextResponse.json({ error: 'Sólo administración puede reimportar fuentes financieras' }, { status: 403 });
  }

  const { id } = await contextParams.params;

  const { data: sourceImport, error: importError } = await context.supabase
    .from('motil_finance_workbook_imports')
    .select('id,organization_id,filename,source_sha256,source_kind,sender_declared_not_final,review_status,metadata')
    .eq('id', id)
    .eq('organization_id', context.organizationId)
    .maybeSingle();

  if (importError) return NextResponse.json({ error: importError.message }, { status: 500 });
  if (!sourceImport) return NextResponse.json({ error: 'Fuente financiera no encontrada' }, { status: 404 });

  const { count: promotedCount, error: promotedError } = await context.supabase
    .from('motil_finance_asset_stage')
    .select('id', { count: 'exact', head: true })
    .eq('import_id', sourceImport.id)
    .eq('promoted_to_canonical', true);

  if (promotedError) return NextResponse.json({ error: promotedError.message }, { status: 500 });
  if ((promotedCount || 0) > 0) {
    return NextResponse.json(
      { error: 'La fuente ya tiene filas promovidas a canónico; requiere revisión antes de reimportar' },
      { status: 409 },
    );
  }

  const metadata = (sourceImport.metadata || {}) as Record<string, unknown>;
  const bucket = textValue(metadata.storage_bucket);
  const storagePath = textValue(metadata.storage_path);
  if (!bucket || !storagePath) {
    return NextResponse.json({ error: 'La fuente no tiene ubicación de Storage verificable' }, { status: 422 });
  }

  const { data: file, error: downloadError } = await context.supabase.storage
    .from(bucket)
    .download(storagePath);

  if (downloadError || !file) {
    return NextResponse.json({ error: downloadError?.message || 'No se pudo leer el archivo fuente' }, { status: 500 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== sourceImport.source_sha256) {
    return NextResponse.json(
      { error: 'El archivo almacenado no coincide con el hash registrado; importación detenida' },
      { status: 409 },
    );
  }

  let workbook: WorkbookLike;
  try {
    workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo interpretar el Excel' },
      { status: 422 },
    );
  }

  const { data: canonicalAssets, error: canonicalError } = await context.supabase
    .schema('canonical')
    .from('assets')
    .select('id,name,serial_number,license_plate,cost_center_code')
    .eq('organization_id', context.organizationId);

  if (canonicalError) return NextResponse.json({ error: canonicalError.message }, { status: 500 });

  let stagedRows: StageRow[];
  try {
    if (sourceImport.source_kind === 'insured_asset_inventory') {
      stagedRows = stageInsuranceWorkbook({
        workbook,
        organizationId: context.organizationId,
        importId: sourceImport.id,
        sourceSha256: sourceImport.source_sha256,
        canonicalAssets: canonicalAssets || [],
      });
    } else if (sourceImport.source_kind === 'fixed_asset_depreciation_model') {
      stagedRows = stageDepreciationWorkbook({
        workbook,
        organizationId: context.organizationId,
        importId: sourceImport.id,
        sourceSha256: sourceImport.source_sha256,
        canonicalAssets: canonicalAssets || [],
      });
    } else {
      return NextResponse.json({ error: `Tipo de fuente no soportado: ${sourceImport.source_kind}` }, { status: 422 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'La estructura del workbook no coincide con lo esperado' },
      { status: 422 },
    );
  }

  const { error: clearError } = await context.supabase
    .from('motil_finance_asset_stage')
    .delete()
    .eq('import_id', sourceImport.id)
    .eq('promoted_to_canonical', false);

  if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });

  for (let offset = 0; offset < stagedRows.length; offset += 200) {
    const batch = stagedRows.slice(offset, offset + 200);
    const { error: insertError } = await context.supabase
      .from('motil_finance_asset_stage')
      .insert(batch);
    if (insertError) {
      return NextResponse.json(
        { error: insertError.message, insertedBeforeFailure: offset },
        { status: 500 },
      );
    }
  }

  const counts = stagedRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.record_kind] = (acc[row.record_kind] || 0) + 1;
    return acc;
  }, {});
  const matched = stagedRows.filter((row) => row.identity_status === 'matched').length;
  const anomalyRows = stagedRows.filter((row) => {
    const flags = Array.isArray(row.source_payload.review_flags) ? row.source_payload.review_flags : [];
    return row.source_payload.anomaly_wide_row === true || flags.length > 0;
  }).length;

  const nextMetadata = {
    ...metadata,
    stage: {
      imported_at: new Date().toISOString(),
      rows: stagedRows.length,
      counts,
      matched,
      unresolved: stagedRows.length - matched,
      anomaly_rows: anomalyRows,
      importer: 'motil_finance_workbook_stage_v1',
    },
  };

  const { error: updateError } = await context.supabase
    .from('motil_finance_workbook_imports')
    .update({
      review_status: (metadata.canonical === true || sourceImport.review_status === 'canonical_with_observations')
        ? 'canonical_with_observations'
        : 'needs_review',
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceImport.id)
    .eq('organization_id', context.organizationId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    data: {
      importId: sourceImport.id,
      filename: sourceImport.filename,
      sourceKind: sourceImport.source_kind,
      rows: stagedRows.length,
      counts,
      matched,
      unresolved: stagedRows.length - matched,
      anomalyRows,
      sourceSha256: actualSha256,
      promotedToCanonical: 0,
    },
  });
}

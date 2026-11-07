export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { loadXlsxModule, sheetToMatrix, type XlsxCellValue } from '@/lib/xlsx';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function text(value: XlsxCellValue) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function numeric(value: XlsxCellValue) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateKey(value: XlsxCellValue) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value ?? '').trim();
  const match = raw.match(/(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return null;
}

function findPeriod(rows: XlsxCellValue[][]) {
  for (let r = 0; r < Math.min(rows.length, 20); r += 1) {
    const row = rows[r];
    const label = normalize(row?.[0]);
    if (!label.includes('transporte entre el')) continue;
    const dates = row.map(dateKey).filter(Boolean) as string[];
    if (dates.length >= 2) return { start: dates[0], end: dates[1] };
  }
  return null;
}

function findSettlementType(rows: XlsxCellValue[][]) {
  for (let r = 0; r < Math.min(rows.length, 12); r += 1) {
    const joined = rows[r].map(text).join(' ');
    if (!normalize(joined).includes('anticipo o final')) continue;
    const normalizedRow = rows[r].map((cell) => normalize(cell));
    if (normalizedRow.some((cell) => cell === 'anticipo')) return 'advance';
    if (normalizedRow.some((cell) => cell === 'final')) return 'final';
  }
  return 'final';
}

function findHeader(rows: XlsxCellValue[][]) {
  for (let r = 0; r < rows.length; r += 1) {
    const normalized = rows[r].map((cell) => normalize(cell));
    const nameIndex = normalized.findIndex((cell) => cell.includes('transportista'));
    if (nameIndex < 0) continue;
    const summaryWindow = [rows[r - 2] || [], rows[r - 1] || [], rows[r] || []];
    const maxCols = Math.max(...summaryWindow.map((row) => row.length));
    const labels = Array.from({ length: maxCols }, (_, c) =>
      normalize(summaryWindow.map((row) => text(row[c])).filter(Boolean).join(' ')),
    );
    return { rowIndex: r, nameIndex, labels };
  }
  return null;
}

function parseSheet(sheetName: string, rows: XlsxCellValue[][]) {
  const period = findPeriod(rows);
  const header = findHeader(rows);
  if (!period || !header) return [];

  const settlementType = findSettlementType(rows);
  const loansIndex = header.labels.findIndex((label) => label.includes('prestam'));
  const advanceIndex = header.labels.findIndex((label) => label.includes('anticipo'));
  const netIndex = header.labels.findIndex((label) => label.includes('liquido a pago'));
  const rutIndex = header.labels.findIndex((label) => /(^| )rut( |$)/.test(label));
  const fuelIndex = header.labels.findIndex((label) => label.includes('petroleo'));

  if (netIndex < 0) return [];

  const results: Array<{
    sheetName: string;
    sourceRow: number;
    carrierName: string;
    carrierRut: string | null;
    periodStart: string;
    periodEnd: string;
    settlementType: string;
    grossPayable: number;
    loans: number;
    advance: number;
    netPayable: number;
    fuelLiters: number | null;
    components: Array<{ component_type: string; component_key: string; quantity: number; unit: string | null; source_cell: string }>;
  }> = [];

  for (let r = header.rowIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const first = normalize(row[0]);
    const joined = normalize(row.map(text).join(' '));
    if (joined.includes('totales')) break;

    const carrierName = text(row[header.nameIndex]);
    if (!carrierName || first === 'totales' || normalize(carrierName) === 'transportista') continue;

    const netPayable = numeric(row[netIndex]);
    const loans = loansIndex >= 0 ? numeric(row[loansIndex]) ?? 0 : 0;
    const advance = advanceIndex >= 0 ? numeric(row[advanceIndex]) ?? 0 : 0;
    const fuelLiters = fuelIndex >= 0 ? numeric(row[fuelIndex]) : null;
    const carrierRut = rutIndex >= 0 ? text(row[rutIndex]) || null : null;

    const hasFinancialValue = [netPayable, loans, advance].some((value) => Math.abs(Number(value || 0)) > 0.001);
    if (!hasFinancialValue || netPayable === null) continue;

    const components: Array<{ component_type: string; component_key: string; quantity: number; unit: string | null; source_cell: string }> = [];
    for (let c = header.nameIndex + 1; c < netIndex; c += 1) {
      if ([rutIndex, loansIndex, advanceIndex].includes(c)) continue;
      const quantity = numeric(row[c]);
      if (quantity === null || Math.abs(quantity) <= 0.000001) continue;
      const label = header.labels[c] || `columna ${c + 1}`;
      if (label.includes('desayuno') || label.includes('almuerzo') || label.includes('cena')) continue;
      components.push({
        component_type: c === fuelIndex ? 'fuel' : 'transport_quantity',
        component_key: label,
        quantity,
        unit: c === fuelIndex ? 'L' : 'source_unit',
        source_cell: `${sheetName}!R${r + 1}C${c + 1}`,
      });
    }

    results.push({
      sheetName,
      sourceRow: r + 1,
      carrierName,
      carrierRut,
      periodStart: period.start,
      periodEnd: period.end,
      settlementType,
      grossPayable: Number(netPayable) + Number(loans) + Number(advance),
      loans: Number(loans),
      advance: Number(advance),
      netPayable: Number(netPayable),
      fuelLiters,
      components,
    });
  }

  return results;
}

async function authorize(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return { ok: false as const, response: context.response };
  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED') {
    return { ok: false as const, response: NextResponse.json({ error: 'Se requiere permiso de edición Legal' }, { status: 403 }) };
  }
  return { ok: true as const, context };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
  if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: 'Usa un archivo XLS o XLSX' }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'El archivo supera el límite de 20 MB' }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const xlsx = await loadXlsxModule();
  const workbook = xlsx.read(bytes, { type: 'buffer', cellDates: true });

  const parsed = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return sheet ? parseSheet(sheetName, sheetToMatrix(xlsx, sheet, true)) : [];
  });

  if (!parsed.length) {
    return NextResponse.json({ error: 'No se encontraron liquidaciones reconocibles en el libro' }, { status: 422 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const storagePath = `${auth.context.organizationId}/legal/transport/${Date.now()}-${safeName}`;

  const upload = await auth.context.supabase.storage
    .from('document-intake')
    .upload(storagePath, bytes, { contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false });
  if (upload.error) {
    console.error('[legal/transport-import:storage]', upload.error);
    return NextResponse.json({ error: 'No se pudo preservar el archivo fuente' }, { status: 503 });
  }

  const { data: intake, error: intakeError } = await auth.context.supabase
    .from('document_intake_items')
    .insert({
      organization_id: auth.context.organizationId,
      storage_bucket: 'document-intake',
      storage_path: storagePath,
      original_name: file.name,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      sha256,
      source: 'manual_upload',
      area: 'legal',
      metadata: { kind: 'transport_settlement_workbook', sheets: workbook.SheetNames.length, parsed_rows: parsed.length },
      uploaded_by: auth.context.userId,
    })
    .select('id')
    .single();

  if (intakeError || !intake) {
    await auth.context.supabase.storage.from('document-intake').remove([storagePath]);
    return NextResponse.json({ error: 'No se pudo registrar la fuente documental' }, { status: 503 });
  }

  const { data: suppliers } = await auth.context.supabase
    .from('suppliers')
    .select('id,name,rut')
    .eq('organization_id', auth.context.organizationId)
    .limit(5000);

  const suppliersByName = new Map<string, Array<{ id: string; name: string; rut: string | null }>>();
  for (const supplier of suppliers || []) {
    const key = normalize(supplier.name);
    const list = suppliersByName.get(key) || [];
    list.push(supplier);
    suppliersByName.set(key, list);
  }

  const fingerprints = parsed.map((row) => {
    const identity = normalize(row.carrierRut || row.carrierName).replace(/ /g, '');
    return `transport:${row.sheetName}:${row.sourceRow}:${identity}`;
  });

  const { data: existing } = await auth.context.supabase
    .from('transport_settlements')
    .select('source_fingerprint')
    .eq('organization_id', auth.context.organizationId)
    .in('source_fingerprint', fingerprints);

  const existingSet = new Set((existing || []).map((row) => String(row.source_fingerprint)));
  const candidates = parsed.flatMap((row, index) => {
    const fingerprint = fingerprints[index];
    if (existingSet.has(fingerprint)) return [];

    const matches = suppliersByName.get(normalize(row.carrierName)) || [];
    const supplier = matches.length === 1 ? matches[0] : null;
    return [{
      organization_id: auth.context.organizationId,
      supplier_id: supplier?.id || null,
      carrier_name: row.carrierName,
      carrier_rut: row.carrierRut || supplier?.rut || null,
      period_start: row.periodStart,
      period_end: row.periodEnd,
      settlement_type: row.settlementType,
      gross_payable_clp: row.grossPayable,
      loans_clp: row.loans || null,
      advance_clp: row.advance || null,
      net_payable_clp: row.netPayable,
      fuel_liters: row.fuelLiters,
      source_file: file.name,
      source_sheet: row.sheetName,
      source_row: row.sourceRow,
      source_fingerprint: fingerprint,
      _components: row.components,
      _supplier_match: supplier ? 'exact_name' : matches.length > 1 ? 'ambiguous_name' : 'unmatched',
    }];
  });

  if (!candidates.length) {
    await auth.context.supabase
      .from('document_intake_items')
      .update({ status: 'linked', linked_at: new Date().toISOString(), metadata: { kind: 'transport_settlement_workbook', sheets: workbook.SheetNames.length, parsed_rows: parsed.length, new_rows: 0, duplicate_rows: parsed.length } })
      .eq('id', intake.id)
      .eq('organization_id', auth.context.organizationId);

    return NextResponse.json({
      intakeId: intake.id,
      summary: { parsed: parsed.length, new_candidates: 0, duplicates: parsed.length, unmatched_suppliers: 0 },
      candidates: [],
      next_action: 'El libro ya estaba incorporado; no se crearon duplicados.',
    });
  }

  const insertRows = candidates.map(({ _components, _supplier_match, ...row }) => row);
  const { data: inserted, error: insertError } = await auth.context.supabase
    .from('transport_settlements')
    .insert(insertRows)
    .select('id,source_fingerprint,carrier_name,carrier_rut,period_start,period_end,net_payable_clp');

  if (insertError || !inserted) {
    return NextResponse.json({ error: 'No se pudieron preparar liquidaciones candidatas' }, { status: 503 });
  }

  const candidateByFingerprint = new Map(candidates.map((row) => [row.source_fingerprint, row]));
  const links = inserted.map((row) => ({
    organization_id: auth.context.organizationId,
    intake_item_id: intake.id,
    entity_type: 'transport_settlement',
    entity_id: row.id,
    relation_type: 'derived_from',
    source_sheet: candidateByFingerprint.get(row.source_fingerprint)?.source_sheet || null,
    source_row: candidateByFingerprint.get(row.source_fingerprint)?.source_row || null,
    source_key: row.source_fingerprint,
    promotion_status: 'candidate',
    notes: 'Carga directa desde Legal. Requiere revisión humana antes de promoción canónica.',
  }));

  const { error: linkError } = await auth.context.supabase.from('document_intake_entity_links').insert(links);
  if (linkError) return NextResponse.json({ error: 'Las liquidaciones quedaron preparadas, pero faltó vincular la evidencia' }, { status: 503 });

  const components = inserted.flatMap((row) =>
    (candidateByFingerprint.get(row.source_fingerprint)?._components || []).map((component) => ({
      organization_id: auth.context.organizationId,
      settlement_id: row.id,
      ...component,
    })),
  );
  if (components.length) {
    const { error: componentError } = await auth.context.supabase.from('transport_settlement_components').insert(components);
    if (componentError) console.error('[legal/transport-import:components]', componentError);
  }

  const unmatched = candidates.filter((row) => row._supplier_match !== 'exact_name').length;
  await auth.context.supabase
    .from('document_intake_items')
    .update({
      status: 'linked',
      linked_at: new Date().toISOString(),
      metadata: {
        kind: 'transport_settlement_workbook',
        sheets: workbook.SheetNames.length,
        parsed_rows: parsed.length,
        new_rows: inserted.length,
        duplicate_rows: parsed.length - inserted.length,
        unmatched_suppliers: unmatched,
      },
    })
    .eq('id', intake.id)
    .eq('organization_id', auth.context.organizationId);

  return NextResponse.json({
    intakeId: intake.id,
    summary: {
      parsed: parsed.length,
      new_candidates: inserted.length,
      duplicates: parsed.length - inserted.length,
      unmatched_suppliers: unmatched,
    },
    candidates: inserted.slice(-20),
    next_action: unmatched
      ? 'Revisar proveedores sin coincidencia exacta y luego promover la carga.'
      : 'Revisar el período y promover la carga cuando los montos sean correctos.',
  }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const intakeId = String(body.intakeId || '').trim();
  if (!intakeId) return NextResponse.json({ error: 'Carga requerida' }, { status: 400 });

  const { data: links, error: readError } = await auth.context.supabase
    .from('document_intake_entity_links')
    .select('id,entity_id,promotion_status')
    .eq('organization_id', auth.context.organizationId)
    .eq('intake_item_id', intakeId)
    .eq('entity_type', 'transport_settlement');

  if (readError) return NextResponse.json({ error: 'No se pudo verificar la carga' }, { status: 503 });
  if (!links?.length) return NextResponse.json({ error: 'La carga no contiene liquidaciones candidatas' }, { status: 404 });

  const { data: unresolved } = await auth.context.supabase
    .from('transport_settlements')
    .select('id,carrier_name,carrier_rut,supplier_id')
    .eq('organization_id', auth.context.organizationId)
    .in('id', links.map((link) => link.entity_id))
    .or('supplier_id.is.null,carrier_rut.is.null');

  if (unresolved?.length) {
    return NextResponse.json({
      error: 'Hay transportistas sin proveedor/RUT resuelto',
      unresolved: unresolved.slice(0, 20),
    }, { status: 409 });
  }

  const { error: promoteError } = await auth.context.supabase
    .from('document_intake_entity_links')
    .update({ promotion_status: 'promoted', notes: 'Promovido por revisión humana desde Legal.', updated_at: new Date().toISOString() })
    .eq('organization_id', auth.context.organizationId)
    .eq('intake_item_id', intakeId)
    .eq('entity_type', 'transport_settlement')
    .eq('promotion_status', 'candidate');

  if (promoteError) return NextResponse.json({ error: 'No se pudo promover la carga' }, { status: 503 });

  await auth.context.supabase
    .from('audit_log')
    .insert({
      organization_id: auth.context.organizationId,
      user_id: auth.context.userId,
      action: 'legal.transport_settlements.promoted',
      resource_type: 'document_intake_item',
      resource_id: intakeId,
      resource_identifier: intakeId,
      new_values: { settlements: links.length },
      status: 'completed',
    });

  return NextResponse.json({
    ok: true,
    promoted: links.length,
    authority: 'Liquidaciones promovidas a la vista canónica. No se ejecutó ningún pago ni anticipo.',
  });
}

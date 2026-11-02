#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';
import * as XLSX from 'xlsx';

const { Client } = pg;
const ORG_DEFAULT = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';

function parseArgs(argv) {
  const out = { commit: false, organizationId: ORG_DEFAULT, mine: 'Don Jaime' };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--file') out.file = argv[++i];
    else if (value === '--organization-id') out.organizationId = argv[++i];
    else if (value === '--mine') out.mine = argv[++i];
    else if (value === '--gmail-message-id') out.gmailMessageId = argv[++i];
    else if (value === '--received-at') out.receivedAt = argv[++i];
    else if (value === '--source-owner') out.sourceOwner = argv[++i];
    else if (value === '--commit') out.commit = true;
    else if (value === '--help' || value === '-h') out.help = true;
    else throw new Error(`Argumento desconocido: ${value}`);
  }
  return out;
}

function help() {
  console.log(`Uso:
  node scripts/import-don-jaime-reported-availability.mjs --file <reporte.xlsx> [--gmail-message-id <id>] [--received-at <iso>] [--commit]

Sin --commit: analiza, normaliza y reporta estados.
Con --commit: conserva la evidencia diaria en maintenance_reported_availability_*.
STANDBY queda review_required y no entra al denominador hasta validación operacional.
Requiere DATABASE_URL solamente con --commit.`);
}

function text(value) {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out || null;
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
}

function normalized(value) {
  return (text(value) || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/N[°º]/g, 'N')
    .replace(/ONRAM/g, 'OMRAM')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha(...parts) {
  return createHash('sha256').update(parts.map((part) => part ?? '').join('|')).digest('hex');
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return null;
  const cl = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (cl) return `${cl[3]}-${cl[2].padStart(2, '0')}-${cl[1].padStart(2, '0')}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeState(rawStatus) {
  const status = normalized(rawStatus);
  if (status === 'OPERATIVO' || status.startsWith('OPERATIVO OBS')) {
    return { normalizedState: 'available', classification: 'available', downtimeKind: null };
  }
  if (status === 'EN MANTENCION' || status === 'FUERA DE SERVICIO') {
    return { normalizedState: 'unavailable', classification: 'unavailable', downtimeKind: 'unknown' };
  }
  if (status === 'STANDBY') {
    return { normalizedState: 'standby', classification: 'review_required', downtimeKind: null };
  }
  return { normalizedState: 'unknown', classification: 'review_required', downtimeKind: null };
}

function rowsFromWorkbook(bytes, filename) {
  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true, cellFormula: true });
  const sheetName = workbook.SheetNames.includes('Reporte Diario') ? 'Reporte Diario' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('El workbook no contiene una hoja utilizable.');

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  let reportedDate = null;
  let headerIndex = -1;
  let headers = [];

  for (let index = 0; index < Math.min(matrix.length, 20); index += 1) {
    const row = matrix[index] || [];
    for (let cell = 0; cell < row.length; cell += 1) {
      if (normalized(row[cell]) === 'FECHA DEL REPORTE') {
        for (let next = cell + 1; next < Math.min(row.length, cell + 8); next += 1) {
          const candidate = parseDate(row[next]);
          if (candidate) {
            reportedDate = candidate;
            break;
          }
        }
      }
    }
    const labels = row.map((value) => text(value) || '');
    if (labels.includes('Equipo') && labels.includes('Estado')) {
      headerIndex = index;
      headers = labels;
      break;
    }
  }

  if (!reportedDate) throw new Error(`No se pudo resolver Fecha del reporte en ${filename}`);
  if (headerIndex < 0) throw new Error(`No se encontró la fila Equipo/Estado en ${filename}`);

  const indexOf = (label) => headers.indexOf(label);
  const output = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index] || [];
    const rawAssetName = text(row[indexOf('Equipo')]);
    const rawStatus = text(row[indexOf('Estado')]);
    if (!rawAssetName) continue;
    if (normalized(rawAssetName).startsWith('RESUMEN DEL DIA') || normalized(rawAssetName).startsWith('ALERTAS DEL REPORTE')) break;
    if (!rawStatus) continue;

    const state = normalizeState(rawStatus);
    const raw = {
      sourceRow: index + 1,
      rawAssetName,
      rawStatus,
      ...state,
      meterUnit: indexOf('Unidad') >= 0 ? text(row[indexOf('Unidad')]) : null,
      meterValue: indexOf('Horómetro / Km actual') >= 0 ? number(row[indexOf('Horómetro / Km actual')]) : null,
      detail: indexOf('Detalle / Diagnóstico') >= 0 ? text(row[indexOf('Detalle / Diagnóstico')]) : null,
      workPerformed: indexOf('Trabajo realizado') >= 0 ? text(row[indexOf('Trabajo realizado')]) : null,
      partRequired: indexOf('Repuesto requerido') >= 0 ? text(row[indexOf('Repuesto requerido')]) : null,
      responsible: indexOf('Responsable') >= 0 ? text(row[indexOf('Responsable')]) : null,
      planningObservation: indexOf('Observación planificación') >= 0 ? text(row[indexOf('Observación planificación')]) : null,
      costCenterRaw: indexOf('CC') >= 0 ? text(row[indexOf('CC')]) : null,
    };
    output.push(raw);
  }

  return { sheetName, reportedDate, rows: output };
}

function plate(value) {
  const match = normalized(value).match(/\b([A-Z]{4})\s?(\d{2})\b/);
  return match ? `${match[1]}-${match[2]}` : null;
}

async function crosswalk(client, organizationId, mine) {
  const planning = await client.query(
    `select r.asset_name_raw, r.canonical_asset_id, r.reconciliation_status, a.name as canonical_name, a.asset_code
       from public.planning_maintenance_source_rows r
       join public.planning_maintenance_source_imports i on i.id=r.import_id
       left join canonical.assets a on a.id=r.canonical_asset_id
      where r.organization_id=$1 and lower(coalesce(r.mine_raw,''))=lower($2)
        and i.status <> 'archived'`,
    [organizationId, mine],
  );

  const exact = new Map();
  const plateCandidates = new Map();
  for (const row of planning.rows) {
    if (row.reconciliation_status !== 'matched' || !row.canonical_asset_id) continue;
    for (const candidate of [row.asset_name_raw, row.canonical_name, row.asset_code]) {
      const key = normalized(candidate);
      if (key) exact.set(key, row.canonical_asset_id);
      const p = plate(candidate);
      if (p) {
        const current = plateCandidates.get(p) || new Set();
        current.add(row.canonical_asset_id);
        plateCandidates.set(p, current);
      }
    }
  }
  return { exact, plateCandidates };
}

function resolveAsset(row, maps) {
  const keys = [row.rawAssetName, row.costCenterRaw].map(normalized).filter(Boolean);
  for (const key of keys) {
    const id = maps.exact.get(key);
    if (id) return { canonicalAssetId: id, status: 'matched', method: 'official_master_exact' };
  }

  for (const candidate of [row.rawAssetName, row.costCenterRaw]) {
    const p = plate(candidate);
    if (!p) continue;
    const ids = maps.plateCandidates.get(p);
    if (ids?.size === 1) return { canonicalAssetId: [...ids][0], status: 'matched', method: 'official_master_unique_plate' };
    if (ids?.size > 1) return { canonicalAssetId: null, status: 'ambiguous', method: 'official_master_plate_conflict', reviewReason: `Patente ${p} tiene más de un candidato.` };
  }

  return { canonicalAssetId: null, status: 'review_required', method: null, reviewReason: 'Sin match determinístico en Programa Maestro oficial.' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();
  if (!args.file) throw new Error('Falta --file');

  const bytes = await readFile(args.file);
  const sourceSha = createHash('sha256').update(bytes).digest('hex');
  const parsed = rowsFromWorkbook(bytes, args.file);

  const stateCounts = parsed.rows.reduce((acc, row) => {
    acc[row.rawStatus] = (acc[row.rawStatus] || 0) + 1;
    return acc;
  }, {});

  const dryRun = {
    mode: args.commit ? 'commit' : 'dry-run',
    file: args.file,
    mine: args.mine,
    reportedDate: parsed.reportedDate,
    sheet: parsed.sheetName,
    rows: parsed.rows.length,
    stateCounts,
    includedAvailable: parsed.rows.filter((row) => row.classification === 'available').length,
    includedUnavailable: parsed.rows.filter((row) => row.classification === 'unavailable').length,
    reviewRequired: parsed.rows.filter((row) => row.classification === 'review_required').length,
  };

  if (!args.commit) {
    console.log(JSON.stringify(dryRun, null, 2));
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');
    const maps = await crosswalk(client, args.organizationId, args.mine);

    await client.query(
      `update public.maintenance_reported_availability_sources
          set is_current=false, status='archived'
        where organization_id=$1 and lower(mine)=lower($2) and reported_date=$3 and is_current=true`,
      [args.organizationId, args.mine, parsed.reportedDate],
    );

    const source = await client.query(
      `insert into public.maintenance_reported_availability_sources
        (organization_id,mine,reported_date,source_file,source_sha256,source_sheet,gmail_message_id,received_at,source_owner,status,is_current)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'official_source',true)
       on conflict (organization_id,source_sha256,source_sheet)
       do update set gmail_message_id=coalesce(excluded.gmail_message_id,maintenance_reported_availability_sources.gmail_message_id),
                     received_at=coalesce(excluded.received_at,maintenance_reported_availability_sources.received_at),
                     is_current=true,status='official_source'
       returning id`,
      [args.organizationId,args.mine,parsed.reportedDate,args.file,sourceSha,parsed.sheetName,args.gmailMessageId || null,args.receivedAt || null,args.sourceOwner || null],
    );
    const sourceId = source.rows[0].id;

    let matched = 0;
    let unresolved = 0;
    for (const row of parsed.rows) {
      const resolution = resolveAsset(row, maps);
      if (resolution.status === 'matched') matched += 1;
      else unresolved += 1;
      const rowHash = sha(sourceSha, parsed.sheetName, row.sourceRow, row.rawAssetName, row.rawStatus, row.meterValue);
      await client.query(
        `insert into public.maintenance_reported_availability_rows
          (organization_id,source_id,source_row,raw_asset_name,canonical_asset_id,raw_status,normalized_state,availability_classification,downtime_kind,meter_unit,meter_value,detail,work_performed,part_required,responsible,planning_observation,cost_center_raw,source_payload,row_hash,reconciliation_status,reconciliation_method,review_reason,validation_status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,'valid')
         on conflict (source_id,source_row)
         do update set canonical_asset_id=excluded.canonical_asset_id,
                       raw_status=excluded.raw_status,
                       normalized_state=excluded.normalized_state,
                       availability_classification=excluded.availability_classification,
                       downtime_kind=excluded.downtime_kind,
                       meter_value=excluded.meter_value,
                       detail=excluded.detail,
                       planning_observation=excluded.planning_observation,
                       cost_center_raw=excluded.cost_center_raw,
                       source_payload=excluded.source_payload,
                       reconciliation_status=excluded.reconciliation_status,
                       reconciliation_method=excluded.reconciliation_method,
                       review_reason=excluded.review_reason,
                       updated_at=now()`,
        [args.organizationId,sourceId,row.sourceRow,row.rawAssetName,resolution.canonicalAssetId,row.rawStatus,row.normalizedState,row.classification,row.downtimeKind,row.meterUnit,row.meterValue,row.detail,row.workPerformed,row.partRequired,row.responsible,row.planningObservation,row.costCenterRaw,JSON.stringify(row),rowHash,resolution.status,resolution.method,resolution.reviewReason || null],
      );
    }

    await client.query('commit');
    console.log(JSON.stringify({ ...dryRun, committed: true, matched, unresolved }, null, 2));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

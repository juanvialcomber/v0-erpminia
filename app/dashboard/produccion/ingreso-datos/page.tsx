'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Save, Upload } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calculatePlantPreview, validatePlantEntry } from '@/lib/production/plant-entry-validation.mjs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from '@/components/ui/page-header';

type ParsedTmRow = {
  movement_number?: string | null;
  movement_date: string;
  mine_name_raw?: string | null;
  sector_name_raw?: string | null;
  driver_name_raw?: string | null;
  carrier_name_raw?: string | null;
  vehicle_plate_raw?: string | null;
  seal_number?: string | null;
  raw_quantity: number;
  client_name_raw?: string | null;
  movement_description_raw?: string | null;
  interior_mine_raw?: string | null;
  debt_status_raw?: string | null;
  source_file: string;
  source_sheet: string;
  source_row: number;
  source_hash: string;
  source_payload: Record<string, unknown>;
};

type ParsedTmFile = {
  file: File;
  fileSha256: string;
  periodStart: string;
  periodEnd: string;
  rows: ParsedTmRow[];
};

function normalizedHeader(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function toIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function sha256Bytes(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(text: string) {
  return sha256Bytes(new TextEncoder().encode(text).buffer);
}

export default function ProductionDataEntryPage() {
  const [tmFile, setTmFile] = useState<ParsedTmFile | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [manualTransport, setManualTransport] = useState({
    movementDate: '', movementNumber: '', client: '', description: '', driver: '', carrier: '', plate: '', sector: '', mineOrigin: '', interiorMine: '', sealNumber: '', netWeight: '', debtStatus: '',
  });
  const [plant, setPlant] = useState({
    operationDate: '', shiftCode: '', treatedWetMetricTons: '', mineralMoisturePct: '', headGrade: '', concentrateGrade: '', tailingsGrade: '', galigherGrade: '', concentrateWetMetricTons: '', concentrateMoisturePct: '', dispatchedMetricTons: '', dispatchMoisturePct: '', dispatchGrade: '', lotNumber: '', blendCode: '',
  });
  const [savingTransport, setSavingTransport] = useState(false);
  const [savingPlant, setSavingPlant] = useState(false);

  const plantPreview = useMemo(() => calculatePlantPreview(plant), [plant]);

  async function parseTm2026(file: File) {
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const fileSha256 = await sha256Bytes(buffer);
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const rows: ParsedTmRow[] = [];

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: null });
        if (!matrix.length) continue;
        const headers = (matrix[0] || []).map(normalizedHeader);
        const index = (name: string) => headers.findIndex((header) => header === name);
        const numberIndex = index('NUMERO');
        const dateIndex = index('FECHA');
        const tonIndex = index('TONELAJE NETO');
        if (numberIndex < 0 || dateIndex < 0 || tonIndex < 0) continue;

        const clientIndex = index('CLIENTE');
        const descriptionIndex = index('DESCRIPCION');
        const driverIndex = index('CONDUCTOR');
        const carrierIndex = index('EMPRESA TRANSPORTISTA');
        const plateIndex = index('PATENTE');
        const sectorIndex = index('SECTOR');
        const mineIndex = index('MINA ORIGEN');
        const interiorIndex = index('INTERIOR MINA');
        const sealIndex = index('NUMERO DE SELLO');
        const debtIndex = index('DEUDA');

        for (let i = 1; i < matrix.length; i += 1) {
          const row = matrix[i] || [];
          const movementDate = toIsoDate(row[dateIndex]);
          const rawQuantity = Number(row[tonIndex]);
          if (!movementDate || !Number.isFinite(rawQuantity) || rawQuantity <= 0) continue;
          const movementNumber = row[numberIndex] == null ? null : String(row[numberIndex]).trim();
          const rowHash = await sha256Text(`${fileSha256}|${sheetName}|${i + 1}|${movementNumber || ''}|${movementDate}|${rawQuantity}`);
          const value = (position: number) => position >= 0 && row[position] != null ? String(row[position]).trim() : null;
          rows.push({
            movement_number: movementNumber,
            movement_date: movementDate,
            client_name_raw: value(clientIndex),
            movement_description_raw: value(descriptionIndex),
            driver_name_raw: value(driverIndex),
            carrier_name_raw: value(carrierIndex),
            vehicle_plate_raw: value(plateIndex),
            sector_name_raw: value(sectorIndex),
            mine_name_raw: value(mineIndex),
            interior_mine_raw: value(interiorIndex),
            seal_number: value(sealIndex),
            raw_quantity: rawQuantity,
            debt_status_raw: value(debtIndex),
            source_file: file.name,
            source_sheet: sheetName,
            source_row: i + 1,
            source_hash: rowHash,
            source_payload: {},
          });
        }
      }

      if (!rows.length) throw new Error('No se encontraron hojas con el contrato TM 2026 (NUMERO, FECHA, TONELAJE NETO).');
      rows.sort((a, b) => a.movement_date.localeCompare(b.movement_date) || a.source_sheet.localeCompare(b.source_sheet) || a.source_row - b.source_row);
      setTmFile({ file, fileSha256, periodStart: rows[0].movement_date, periodEnd: rows[rows.length - 1].movement_date, rows });
      toast.success(`${rows.length.toLocaleString('es-CL')} movimientos identificados`);
    } catch (error) {
      setTmFile(null);
      toast.error(error instanceof Error ? error.message : 'No fue posible analizar el archivo');
    } finally {
      setParsing(false);
    }
  }

  async function importTm2026() {
    if (!tmFile || importing) return;
    setImporting(true);
    try {
      const sessionResponse = await fetch('/api/produccion/import/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'mineral_transport', sourceFile: tmFile.file.name, sourceFileSha256: tmFile.fileSha256, periodStart: tmFile.periodStart, periodEnd: tmFile.periodEnd, templateVersion: 'TM_2026_V1' }),
      });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(session.error || 'No fue posible iniciar la importación');
      if (!session.alreadyImported) {
        for (let offset = 0; offset < tmFile.rows.length; offset += 300) {
          const response = await fetch('/api/produccion/import/material-movements', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId: session.batchId, rows: tmFile.rows.slice(offset, offset + 300) }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || `Error en bloque ${offset + 1}`);
        }
        const finalizeResponse = await fetch('/api/produccion/import/finalize', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: session.batchId, expectedRows: tmFile.rows.length }),
        });
        const finalize = await finalizeResponse.json();
        if (!finalizeResponse.ok) throw new Error(finalize.error || 'No fue posible cerrar la importación');
      }
      toast.success(session.alreadyImported ? 'Este archivo ya estaba importado' : 'TM 2026 importado y reconciliado por hash');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible importar TM 2026');
    } finally {
      setImporting(false);
    }
  }

  async function saveManualTransport() {
    setSavingTransport(true);
    try {
      const response = await fetch('/api/produccion/data-entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...manualTransport, mode: 'mineral_transport', netWeight: Number(manualTransport.netWeight) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No fue posible guardar el movimiento');
      toast.success(`Movimiento guardado: ${Number(result.movement?.normalized_metric_tons || 0).toLocaleString('es-CL')} t`);
      setManualTransport({ movementDate: '', movementNumber: '', client: '', description: '', driver: '', carrier: '', plate: '', sector: '', mineOrigin: '', interiorMine: '', sealNumber: '', netWeight: '', debtStatus: '' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible guardar el movimiento');
    } finally {
      setSavingTransport(false);
    }
  }

  async function savePlant() {
    const validated = validatePlantEntry({ mode: 'plant_metallurgy', ...plant });
    if (!validated.ok) {
      toast.error(validated.error || 'Revise los datos del turno antes de guardar');
      return;
    }
    setSavingPlant(true);
    try {
      const response = await fetch('/api/produccion/data-entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated.payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No fue posible guardar el turno');
      toast.success('Turno registrado. Revise sus resultados antes de usarlos en un cierre.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible guardar el turno');
    } finally {
      setSavingPlant(false);
    }
  }

  const format = (value: number | null, suffix = ' t') => value == null || !Number.isFinite(value) ? '—' : `${value.toLocaleString('es-CL', { maximumFractionDigits: 4 })}${suffix}`;

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Producción · Fuente canónica</PageHeaderEyebrow>
          <PageHeaderTitle>Ingreso de datos</PageHeaderTitle>
          <PageHeaderDescription>Registra Transporte de Mineral o Planta/Leyes. Motil conserva el dato observado, normaliza unidades y calcula resultados metalúrgicos en base seca.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions><Button asChild variant="outline"><Link href="/dashboard/produccion"><ArrowLeft className="h-4 w-4" />Volver a Producción</Link></Button></PageHeaderActions>
      </PageHeader>

      <Tabs defaultValue="transport" className="space-y-5">
        <TabsList><TabsTrigger value="transport">Transporte de Mineral</TabsTrigger><TabsTrigger value="plant">Planta / Leyes</TabsTrigger></TabsList>

        <TabsContent value="transport" className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-4 w-4" />Importar Excel TM 2026</CardTitle><CardDescription>TM 2026 es el contrato maestro. El archivo se analiza localmente; se envían solamente las filas estructuradas y su lineage.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Input type="file" accept=".xlsx,.xlsm" disabled={parsing || importing} onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseTm2026(file); }} />
              {parsing ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Analizando hojas y contrato TM_2026_V1…</div> : null}
              {tmFile ? <div className="rounded-lg border p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{tmFile.file.name}</p><p className="text-muted-foreground">{tmFile.rows.length.toLocaleString('es-CL')} movimientos · {tmFile.periodStart} → {tmFile.periodEnd}</p></div><Button onClick={() => void importTm2026()} disabled={importing}>{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{importing ? 'Importando…' : 'Confirmar importación'}</Button></div><div className="mt-4 grid gap-2 md:grid-cols-3">{tmFile.rows.slice(0, 3).map((row) => <div key={row.source_hash} className="rounded-md bg-muted/40 p-3"><p className="font-medium">{row.movement_date} · {row.movement_number || 'Sin número'}</p><p className="text-xs text-muted-foreground">{row.mine_name_raw || 'Sin mina'} · {(row.raw_quantity / 1000).toLocaleString('es-CL', { maximumFractionDigits: 3 })} t</p></div>)}</div></div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Ingreso manual TM 2026</CardTitle><CardDescription>Usa la misma estructura del archivo 2026. El peso neto se registra en kg y Motil lo normaliza automáticamente a toneladas.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[['movementDate','Fecha','date'],['movementNumber','Nº viaje','text'],['client','Cliente','text'],['mineOrigin','Mina origen','text'],['sector','Sector','text'],['interiorMine','Interior mina','text'],['driver','Conductor','text'],['carrier','Empresa transportista','text'],['plate','Patente','text'],['sealNumber','Nº sello','text'],['netWeight','Peso neto (kg)','number'],['debtStatus','Estado / deuda','text']].map(([key,label,type]) => <div key={key}><Label htmlFor={key}>{label}</Label><Input id={key} type={type} className="mt-1.5" value={manualTransport[key as keyof typeof manualTransport]} onChange={(event) => setManualTransport((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
              <div className="md:col-span-2 xl:col-span-3"><Label htmlFor="description">Descripción / material</Label><Input id="description" className="mt-1.5" value={manualTransport.description} onChange={(event) => setManualTransport((current) => ({ ...current, description: event.target.value }))} /></div>
              <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button onClick={() => void saveManualTransport()} disabled={savingTransport}>{savingTransport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar movimiento</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plant" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader><CardTitle className="text-base">Turno Planta / Leyes</CardTitle><CardDescription>Separa humedad del mineral y humedad del concentrado. Ingrese toneladas húmedas verificadas: una planilla con Tratado TMS no debe copiarse aquí como toneladas húmedas sin la conversión acreditada.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[['operationDate','Fecha','date'],['shiftCode','Turno','text'],['treatedWetMetricTons','Mineral tratado húmedo (t)','number'],['mineralMoisturePct','Humedad mineral (%)','number'],['headGrade','Ley cabeza (%)','number'],['galigherGrade','Ley Galigher (%)','number'],['concentrateWetMetricTons','Concentrado húmedo (t)','number'],['concentrateMoisturePct','Humedad concentrado (%)','number'],['concentrateGrade','Ley concentrado (%)','number'],['tailingsGrade','Ley relave (%)','number'],['dispatchedMetricTons','Despacho húmedo (t)','number'],['dispatchMoisturePct','Humedad despacho (%)','number'],['dispatchGrade','Ley despacho (%)','number'],['lotNumber','Lote','text'],['blendCode','Mezcla / blend','text']].map(([key,label,type]) => <div key={key}><Label htmlFor={`plant-${key}`}>{label}</Label><Input id={`plant-${key}`} type={type} step={type === 'number' ? 'any' : undefined} className="mt-1.5" value={plant[key as keyof typeof plant]} onChange={(event) => setPlant((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
                <div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button onClick={() => void savePlant()} disabled={savingPlant}>{savingPlant ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar turno y calcular</Button></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4" />Cálculo automático</CardTitle><CardDescription>Vista previa no oficial: sólo calcula con mediciones ingresadas; el servidor valida y recalcula al guardar.</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[['Mineral seco',format(plantPreview.mineralDry)],['Fino alimentación',format(plantPreview.feedFine)],['Recuperación por leyes',format(plantPreview.gradeRecovery,' %')],['Concentrado seco',format(plantPreview.concentrateDry)],['Fino concentrado',format(plantPreview.concentrateFine)],['Recuperación por balance',format(plantPreview.balanceRecovery,' %')],['Fino despachado',format(plantPreview.dispatchFine)]].map(([label,value]) => <div key={label} className="flex items-center justify-between gap-4 border-b pb-2 last:border-0"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div>)}
                {plantPreview.requiresReview ? <p role="alert" className="text-xs text-destructive">Las leyes o el balance entregan una recuperación fuera de 0–100 %. Revisar las mediciones de origen.</p> : null}
                <p className="pt-2 text-xs text-muted-foreground">Si falta evidencia para una fórmula, Motil muestra “—”. No interpreta ausencia de dato como cero.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

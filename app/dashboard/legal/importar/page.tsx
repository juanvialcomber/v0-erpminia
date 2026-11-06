'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import { AlertCircle, ArrowLeft, Download, Loader2, Upload } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadXlsxModule, sheetToMatrix } from '@/lib/xlsx';

type ImportMode = 'documents' | 'contracts';

type ImportResult = {
  success: boolean;
  message: string;
  imported?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  total?: number;
  error?: string;
};

type DocumentRow = {
  title: string;
  description: string;
  category: string;
  documentType: string;
  status: string;
};

type ContractRow = {
  title: string;
  contractorName: string;
  contractNumber: string;
  description: string;
  contractType: string;
  status: string;
  contractValue: number;
  paidAmount: number;
  executionPercentage?: number;
  currency: string;
  complianceStatus: string;
  complianceNotes: string;
  responsibleArea: string;
  projectName: string;
  startDate: string;
  endDate: string;
  sourceLabel?: string;
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

function pickIndex(headers: string[], variants: string[]) {
  return headers.findIndex((header) => variants.some((variant) => header.includes(variant)));
}

function inferLaPataguaContractor(title: string) {
  const normalized = normalizeHeader(title);
  const rules: Array<[RegExp, string]> = [
    [/rpr/, 'RPR INGENIERÍA EN MANTENIMIENTO SPA'],
    [/sl ingenieria/, 'SL INGENIERÍA SpA'],
    [/petra/, 'INGENIERÍA Y CONSTRUCCIÓN PETRA SPA'],
    [/serv.*mineria.*energia/, 'SERVICIOS DE MINERÍA Y ENERGÍAS RENOVABLES SPA'],
    [/geophysical/, 'INGENIERIA Y PROYECTOS GEOPHYSICAL STUDIES CHILE SPA'],
    [/constructora 3d/, 'CONSTRUCTORA 3D SPA'],
    [/spin technologies/, 'SPIN TECHNOLOGIES SERVICIOS DE INGENIERIA LIMITADA'],
    [/global fire/, 'GLOBAL FIRE CHILE SPA'],
    [/sustentable/, 'SUSTENTABLE S.A'],
    [/pma/, 'PMA SPA'],
    [/ga consultores/, 'GA Consultores'],
    [/cedrem/, 'Cedrem'],
  ];
  return rules.find(([pattern]) => pattern.test(normalized))?.[1] || 'Proveedor por conciliar';
}

function parseLaPataguaContractSummary(rows: unknown[][], fileName: string): ContractRow[] {
  const headerRow = rows.findIndex((row) => normalizeHeader(row?.[0]) === 'ncl proy');
  if (headerRow < 0) return [];

  const parsed: ContractRow[] = [];
  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const code = normalizeText(row[0]);
    if (!/^(IO|EP)-\d+$/i.test(code)) continue;

    const title = normalizeText(row[2]);
    const contractValue = typeof row[4] === 'number' ? row[4] : parseNumber(row[4]);
    const paidAmount = typeof row[5] === 'number' ? row[5] : parseNumber(row[5]);
    const observation = normalizeText(row[7]);
    if (!title || !(contractValue > 0)) continue;

    parsed.push({
      title,
      contractorName: inferLaPataguaContractor(title),
      contractNumber: code,
      description: observation,
      contractType: normalizeText(row[1]) || 'Principal',
      status: 'En Revisión',
      contractValue,
      paidAmount,
      currency: normalizeText(row[3]) || 'CLP',
      complianceStatus: 'Pendiente',
      complianceNotes: [
        observation ? `Estado fuente: ${observation}` : '',
        `Fuente operativa: ${fileName} · hoja Resumen · fila ${index + 1}`,
        'Importación desde planilla de seguimiento. Requiere validación humana antes de tratarla como estado jurídico o contractual definitivo.',
      ].filter(Boolean).join(' · '),
      responsibleArea: normalizeText(row[1]),
      projectName: title,
      startDate: '',
      endDate: '',
      sourceLabel: `${fileName} · Resumen · fila ${index + 1}`,
    });
  }
  return parsed;
}

function parseCsvRows(text: string, mode: ImportMode) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(normalizeHeader);

  if (mode === 'documents') {
    const columns = {
      title: pickIndex(headers, ['title', 'titulo', 'nombre']),
      description: pickIndex(headers, ['description', 'descripcion', 'detalle']),
      category: pickIndex(headers, ['category', 'categoria']),
      documentType: pickIndex(headers, ['document_type', 'documenttype', 'document type', 'tipo']),
      status: pickIndex(headers, ['status', 'estado']),
    };

    return lines.slice(1).flatMap((line) => {
      const values = line.split(';').map(normalizeText);
      const title = values[columns.title] || '';
      if (!title) return [];

      return [
        {
          title,
          description: values[columns.description] || '',
          category: values[columns.category] || 'legal',
          documentType: values[columns.documentType] || values[columns.category] || 'legal',
          status: values[columns.status] || 'draft',
        } satisfies DocumentRow,
      ];
    });
  }

  const columns = {
    title: pickIndex(headers, ['title', 'titulo', 'nombre']),
    contractorName: pickIndex(headers, ['contractor_name', 'contratista', 'proveedor']),
    contractNumber: pickIndex(headers, ['contract_number', 'numero_contrato', 'numero', 'nro']),
    description: pickIndex(headers, ['description', 'descripcion', 'detalle']),
    contractType: pickIndex(headers, ['contract_type', 'tipo_contrato', 'tipo']),
    status: pickIndex(headers, ['status', 'estado']),
    contractValue: pickIndex(headers, ['contract_value', 'monto', 'valor']),
    currency: pickIndex(headers, ['currency', 'moneda']),
    complianceStatus: pickIndex(headers, ['compliance_status', 'cumplimiento', 'estado_cumplimiento']),
    startDate: pickIndex(headers, ['start_date', 'fecha_inicio']),
    endDate: pickIndex(headers, ['end_date', 'fecha_fin']),
  };

  return lines.slice(1).flatMap((line) => {
    const values = line.split(';').map(normalizeText);
    const title = values[columns.title] || '';
    if (!title) return [];

    return [
      {
        title,
        contractorName: values[columns.contractorName] || 'Sin contratista',
        contractNumber: values[columns.contractNumber] || '',
        description: values[columns.description] || '',
        contractType: values[columns.contractType] || 'Principal',
        status: values[columns.status] || 'En Revisión',
        contractValue: parseNumber(values[columns.contractValue]),
        paidAmount: 0,
        currency: values[columns.currency] || 'CLP',
        complianceStatus: values[columns.complianceStatus] || 'Pendiente',
        complianceNotes: '',
        responsibleArea: '',
        projectName: '',
        startDate: values[columns.startDate] || '',
        endDate: values[columns.endDate] || '',
      } satisfies ContractRow,
    ];
  });
}

async function parseWorkbook(file: File, mode: ImportMode) {
  const xlsx = await loadXlsxModule();
  const buffer = await file.arrayBuffer();
  const workbook = xlsx.read(buffer, { type: 'array', cellDates: true });
  if (mode === 'contracts' && workbook.SheetNames.includes('Resumen')) {
    const summarySheet = workbook.Sheets.Resumen;
    if (summarySheet) {
      const summaryRows = sheetToMatrix(xlsx, summarySheet, true);
      const laPataguaRows = parseLaPataguaContractSummary(summaryRows, file.name);
      if (laPataguaRows.length) return laPataguaRows;
    }
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const rows = sheetToMatrix(xlsx, sheet, true);
  if (!rows.length) return [];

  const csvText = [
    rows[0].map((value) => normalizeText(value)).join(';'),
    ...rows.slice(1).map((row) => row.map((value) => normalizeText(value)).join(';')),
  ].join('\n');

  return parseCsvRows(csvText, mode);
}

async function parseImportFile(file: File, mode: ImportMode) {
  const filename = file.name.toLowerCase();
  if (filename.endsWith('.csv')) return parseCsvRows(await file.text(), mode);
  if (filename.endsWith('.xls') || filename.endsWith('.xlsx')) return parseWorkbook(file, mode);
  throw new Error('Formato no soportado. Usa CSV, XLS o XLSX.');
}

function buildTemplateCsv(mode: ImportMode) {
  if (mode === 'documents') {
    const headers = ['TITLE', 'DESCRIPTION', 'DOCUMENT_TYPE', 'CATEGORY', 'STATUS'];
    const rows = [
      ['Política HSE', 'Política corporativa de seguridad', 'policy', 'compliance', 'draft'],
      ['Procedimiento vehiculos', 'Uso seguro de vehiculos', 'procedure', 'legal', 'draft'],
    ];
    return [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
  }

  const headers = ['TITLE', 'CONTRACTOR_NAME', 'CONTRACT_NUMBER', 'START_DATE', 'END_DATE', 'STATUS', 'CONTRACT_VALUE', 'CURRENCY', 'COMPLIANCE_STATUS'];
  const rows = [
    ['Contrato transporte', 'Transportes del Norte', 'CNT-2026-0001', '2026-07-01', '2027-06-30', 'Vigente', '15000000', 'CLP', 'Pendiente'],
    ['Contrato mantencion', 'Servicios Andes', 'CNT-2026-0002', '2026-07-01', '2026-12-31', 'Vigente', '8500000', 'CLP', 'Cumple'],
  ];
  return [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
}

async function apiJson(path: string, search: string) {
  const response = await fetch(`${path}${search}`, { credentials: 'include' });
  return response.json().catch(() => null);
}

export default function LegalImportPage() {
  const [activeMode, setActiveMode] = useState<ImportMode>('documents');
  const [dragActive, setDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<Record<ImportMode, ImportResult | null>>({
    documents: null,
    contracts: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentResult = result[activeMode];

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv(activeMode)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = activeMode === 'documents' ? 'plantilla-documentos-legales.csv' : 'plantilla-contratos-legales.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const importDocuments = async (rows: DocumentRow[]) => {
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      const existing = await apiJson('/api/legal/documentos', `?search=${encodeURIComponent(row.title)}`);
      const match = Array.isArray(existing?.documents)
        ? existing.documents.find((item: { title?: string }) => String(item.title || '').trim().toLowerCase() === row.title.trim().toLowerCase())
        : null;

      if (match) {
        skipped += 1;
        continue;
      }

      const response = await fetch('/api/legal/documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: row.title,
          description: row.description,
          category: row.category,
          documentType: row.documentType,
        }),
      });

      if (response.ok) imported += 1;
      else errors += 1;
    }

    return { imported, skipped, errors };
  };

  const importContracts = async (rows: ContractRow[]) => {
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      const lookupKey = row.contractNumber || row.title;
      const existing = await apiJson('/api/legal/contratos', `?search=${encodeURIComponent(lookupKey)}`);
      const match = Array.isArray(existing?.contracts)
        ? existing.contracts.find((item: { contract_number?: string; title?: string }) => {
            const numberMatch = row.contractNumber
              ? String(item.contract_number || '').trim().toLowerCase() === row.contractNumber.trim().toLowerCase()
              : false;
            const titleMatch = String(item.title || '').trim().toLowerCase() === row.title.trim().toLowerCase();
            return numberMatch || titleMatch;
          })
        : null;

      if (match) {
        skipped += 1;
        continue;
      }

      const response = await fetch('/api/legal/contratos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: row.title,
          contractorName: row.contractorName,
          contractNumber: row.contractNumber || undefined,
          description: row.description,
          contractType: row.contractType,
          status: row.status,
          contractValue: row.contractValue,
          paidAmount: row.paidAmount,
          executionPercentage: row.executionPercentage,
          currency: row.currency,
          complianceStatus: row.complianceStatus,
          complianceNotes: row.complianceNotes,
          responsibleArea: row.responsibleArea || undefined,
          projectName: row.projectName || undefined,
          startDate: row.startDate || undefined,
          endDate: row.endDate || undefined,
          fileName: row.sourceLabel ? row.sourceLabel.split(' · ')[0] : undefined,
        }),
      });

      if (response.ok) imported += 1;
      else errors += 1;
    }

    return { imported, skipped, errors };
  };

  const uploadFile = async (file: File) => {
    const valid =
      file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsx');
    if (!valid) {
      setResult((current) => ({
        ...current,
        [activeMode]: { success: false, message: 'Solo aceptamos CSV, XLS o XLSX', error: 'Formato no válido' },
      }));
      return;
    }

    setIsImporting(true);
    setResult((current) => ({ ...current, [activeMode]: null }));

    try {
      const rows = (await parseImportFile(file, activeMode)) as Array<DocumentRow | ContractRow>;
      if (rows.length === 0) {
        throw new Error('No se encontraron filas válidas en el archivo');
      }

      const outcome =
        activeMode === 'documents' ? await importDocuments(rows as DocumentRow[]) : await importContracts(rows as ContractRow[]);

      setResult((current) => ({
        ...current,
        [activeMode]: {
          success: true,
          message:
            activeMode === 'documents'
              ? 'Documentos legales importados correctamente'
              : 'Contratos legales importados correctamente',
          imported: outcome.imported,
          skipped: outcome.skipped,
          errors: outcome.errors,
          total: rows.length,
        },
      }));
    } catch (error) {
      setResult((current) => ({
        ...current,
        [activeMode]: {
          success: false,
          message: error instanceof Error ? error.message : 'No fue posible procesar el archivo',
          error: error instanceof Error ? error.message : 'Error desconocido',
        },
      }));
    } finally {
      setIsImporting(false);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  };

  const modeTitle = useMemo(() => {
    return activeMode === 'documents' ? 'documentos legales' : 'contratos legales';
  }, [activeMode]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Importación legal</h1>
          <p className="mt-2 text-muted-foreground">
            Carga documentos y contratos desde CSV/XLS/XLSX usando el mismo esquema de datos del módulo legal.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/dashboard/legal">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </Button>
      </div>

      <Tabs value={activeMode} onValueChange={(value) => setActiveMode(value as ImportMode)}>
        <TabsList>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
          <TabsTrigger value="contracts">Contratos</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4">
          <ImportPanel
            title="Importar documentos"
            description="Carga o actualiza el inventario documental desde una plantilla."
            activeMode="documents"
            modeTitle={modeTitle}
            downloadTemplate={downloadTemplate}
            fileInputRef={fileInputRef}
            dragActive={dragActive}
            isImporting={isImporting}
            onDragActiveChange={setDragActive}
            onDrop={handleDrop}
            onUpload={() => fileInputRef.current?.click()}
            onFileSelected={uploadFile}
            result={currentResult}
          />
        </TabsContent>

        <TabsContent value="contracts" className="mt-4">
          <ImportPanel
            title="Importar contratos"
            description="Carga contratos y respalda la trazabilidad desde Excel."
            activeMode="contracts"
            modeTitle={modeTitle}
            downloadTemplate={downloadTemplate}
            fileInputRef={fileInputRef}
            dragActive={dragActive}
            isImporting={isImporting}
            onDragActiveChange={setDragActive}
            onDrop={handleDrop}
            onUpload={() => fileInputRef.current?.click()}
            onFileSelected={uploadFile}
            result={currentResult}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ImportPanel({
  title,
  description,
  activeMode,
  modeTitle,
  downloadTemplate,
  fileInputRef,
  dragActive,
  isImporting,
  onDragActiveChange,
  onDrop,
  onUpload,
  onFileSelected,
  result,
}: {
  title: string;
  description: string;
  activeMode: ImportMode;
  modeTitle: string;
  downloadTemplate: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  dragActive: boolean;
  isImporting: boolean;
  onDragActiveChange: (value: boolean) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => Promise<void>;
  onUpload: () => void;
  onFileSelected: (file: File) => Promise<void>;
  result: ImportResult | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="border-border/70 bg-card/80 md:col-span-2">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              onDragActiveChange(true);
            }}
            onDragLeave={() => onDragActiveChange(false)}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border bg-background/50'
            }`}
          >
            <Upload className="mx-auto mb-3 h-10 w-10 text-primary" />
            <p className="font-medium">Arrastra tu archivo aquí o usa el selector</p>
            <p className="mt-1 text-sm text-muted-foreground">Acepta CSV, XLS y XLSX.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Plantilla Excel
              </Button>
              <Button variant="outline" onClick={onUpload} className="gap-2">
                <Upload className="h-4 w-4" />
                Seleccionar archivo
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFileSelected(file);
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={downloadTemplate} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Descargar plantilla
            </Button>
            {isImporting ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importando {modeTitle}...
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>Formato esperado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {activeMode === 'documents' ? (
            <>
              <p>Campos obligatorios: `TITLE`.</p>
              <p>Campos recomendados: `DESCRIPTION`, `DOCUMENT_TYPE`, `CATEGORY`, `STATUS`.</p>
              <p>Los documentos nuevos ingresan como borrador para su revisión legal.</p>
            </>
          ) : (
            <>
              <p>Campos obligatorios: `TITLE` y `CONTRACTOR_NAME`.</p>
              <p>Campos recomendados: `CONTRACT_NUMBER`, `START_DATE`, `END_DATE`, `STATUS`, `CONTRACT_VALUE`, `CURRENCY`, `COMPLIANCE_STATUS`.</p>
              <p>También reconoce la planilla La Patagua con hoja <strong>Resumen</strong> y códigos <code>IO-*</code> / <code>EP-*</code>.</p>
              <p>Los registros importados desde esa planilla entran <strong>En Revisión</strong>; la planilla es evidencia operativa y no reemplaza la validación contractual.</p>
            </>
          )}
        </CardContent>
      </Card>

      {result ? (
        <Alert variant={result.success ? 'default' : 'destructive'} className="md:col-span-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p>{result.message}</p>
              {result.success ? (
                <div className="text-sm">
                  <p>Importados: {result.imported || 0}</p>
                  <p>Saltados: {result.skipped || 0}</p>
                  <p>Errores: {result.errors || 0}</p>
                  <p>Total filas: {result.total || 0}</p>
                </div>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

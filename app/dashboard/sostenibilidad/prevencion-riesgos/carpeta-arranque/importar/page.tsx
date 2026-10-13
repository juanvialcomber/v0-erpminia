'use client';

import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadXlsxModule, sheetToMatrix } from '@/lib/xlsx';

type ImportRow = {
  empresa_nombre: string;
  empresa_rut?: string;
  contacto_email: string;
};

type ImportResult = {
  success: boolean;
  message: string;
  created?: number;
  failed?: number;
  reused?: number;
  inserted_slots?: number;
  total_slots?: number;
  error?: string;
};

function normalize(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeHeader(value: unknown) {
  return normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseCsvRows(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map(normalizeHeader);
  const columns = {
    empresa_nombre: headers.findIndex((h) => h.includes('empresa') || h.includes('razon') || h.includes('nombre')),
    empresa_rut: headers.findIndex((h) => h.includes('rut')),
    contacto_email: headers.findIndex((h) => h.includes('correo') || h.includes('email') || h.includes('contacto')),
  };

  return lines.slice(1).flatMap((line) => {
    const values = line.split(';').map(normalize);
    const empresaNombre = values[columns.empresa_nombre] || values[0] || '';
    const contactoEmail = values[columns.contacto_email] || '';

    if (!empresaNombre || !contactoEmail) return [];

    return [
      {
        empresa_nombre: empresaNombre,
        empresa_rut: values[columns.empresa_rut] || '',
        contacto_email: contactoEmail,
      },
    ];
  });
}

async function parseWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  const xlsx = await loadXlsxModule();
  const workbook = xlsx.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheetToMatrix(xlsx, sheet, true);
  if (!rows.length) return [];

  const csvText = [rows[0].map((value) => normalize(value)).join(';'), ...rows.slice(1).map((row) => row.map((value) => normalize(value)).join(';'))].join('\n');
  return parseCsvRows(csvText);
}

async function parseImportFile(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsvRows(await file.text());
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) return parseWorkbook(file);
  throw new Error('Formato no soportado. Usa CSV, XLS o XLSX.');
}

export default function CarpetaArranqueImportPage({ legalContext = false }: { legalContext?: boolean } = {}) {
  const [dragActive, setDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const headers = ['EMPRESA_NOMBRE', 'EMPRESA_RUT', 'CONTACTO_EMAIL'];
    const rows = [
      ['Constructora Patagua Ltda.', '76.123.456-7', 'contacto@patagua.cl'],
      ['Servicios Mineros Andes SpA', '77.987.654-3', 'prevencion@andes.cl'],
    ];

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-carpeta-arranque.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const uploadFile = async (file: File) => {
    const lowerName = file.name.toLowerCase();
    const valid = lowerName.endsWith('.csv') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx');

    if (!valid) {
      setResult({
        success: false,
        message: 'Solo aceptamos archivos CSV, XLS o XLSX',
        error: 'Tipo de archivo no valido',
      });
      return;
    }

    setIsImporting(true);
    setResult(null);
    setPreview([]);

    try {
      const rows = await parseImportFile(file);
      if (rows.length === 0) {
        setResult({
          success: false,
          message: 'No se encontraron filas validas en el archivo',
          error: 'Archivo vacio o con columnas incorrectas',
        });
        return;
      }

      setPreview(rows.slice(0, 5));

      let created = 0;
      let reused = 0;
      let failed = 0;
      let insertedSlots = 0;
      let totalSlots = 0;

      for (const row of rows) {
        const response = await fetch('/api/carpeta-arranque', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(row),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          failed += 1;
          continue;
        }

        if (payload?.carpeta?.id) {
          if (payload?.created) {
            created += 1;
          } else {
            reused += 1;
          }
          insertedSlots += Number(payload?.inserted_slots || 0);
          totalSlots = Number(payload?.total_slots || totalSlots || 0);
        }
      }

      setResult({
        success: failed === 0,
        message: `Se procesaron ${rows.length} carpetas de arranque`,
        created,
        reused,
        failed,
        inserted_slots: insertedSlots,
        total_slots: totalSlots || undefined,
      });
    } catch (error) {
      setResult({
        success: false,
        message: 'Error al subir el archivo',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Importar Carpeta de Arranque</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Carga empresas contratistas desde Excel para crear carpetas base o reutilizar una carpeta existente y completar el flujo de revisión documental.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Plantilla Excel
          </Button>
          <Button asChild>
            <Link href={legalContext ? "/dashboard/legal/contratistas-documentos" : "/dashboard/sostenibilidad/prevencion-riesgos/carpeta-arranque"}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Volver
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-5 w-5" />
            Cargar empresas
          </CardTitle>
          <CardDescription>
            El archivo debe incluir nombre de empresa y correo de contacto. RUT es opcional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">Arrastra tu archivo o haz clic para seleccionar</p>
            <p className="mt-1 text-sm text-muted-foreground">Formato: CSV, XLS o XLSX</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
              }}
            />
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="mb-2 font-semibold">Columnas esperadas:</p>
              <div className="rounded bg-muted p-2 font-mono text-sm">
                EMPRESA_NOMBRE | EMPRESA_RUT | CONTACTO_EMAIL
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Cada fila crea una carpeta nueva solo si no existe una previa para la misma empresa; si ya existe, se reutiliza y se completan los 19 documentos obligatorios.
              </p>
            </AlertDescription>
          </Alert>

          {preview.length > 0 && (
            <Card className="border-border/70 bg-muted/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Vista previa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {preview.map((row, index) => (
                  <div key={`${row.empresa_nombre}-${index}`} className="rounded-md border border-border p-2">
                    <p className="font-medium">{row.empresa_nombre}</p>
                    <p className="text-muted-foreground">{row.contacto_email}</p>
                    {row.empresa_rut ? <p className="text-xs text-muted-foreground">RUT: {row.empresa_rut}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result && (
            <Alert className={result.success ? 'border-green-500' : 'border-red-500'}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription>
                <p className={result.success ? 'font-semibold text-green-900' : 'font-semibold text-red-900'}>
                  {result.message}
                </p>
                {result.created !== undefined ? <p className="mt-1 text-sm">Creadas: {result.created}</p> : null}
                {result.reused !== undefined ? <p className="text-sm">Reutilizadas: {result.reused}</p> : null}
                {result.failed !== undefined ? <p className="text-sm">Fallidas: {result.failed}</p> : null}
                {result.inserted_slots !== undefined ? <p className="text-sm">Documentos agregados: {result.inserted_slots}</p> : null}
                {result.total_slots !== undefined ? <p className="text-sm">Documentos estándar por carpeta: {result.total_slots}</p> : null}
                {result.error ? <p className="mt-1 text-sm text-red-700">{result.error}</p> : null}
              </AlertDescription>
            </Alert>
          )}

          {isImporting && (
            <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando archivo...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

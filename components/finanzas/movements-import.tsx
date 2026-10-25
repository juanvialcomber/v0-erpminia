'use client';

import { useRef, useState, type DragEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ImportResult = {
  success: boolean;
  message: string;
  imported?: number;
  error?: string;
};

export function MovementsImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const valid = name.endsWith('.csv') || name.endsWith('.xls') || name.endsWith('.xlsx');
    if (!valid) {
      setResult({ success: false, message: 'Este formato de archivo no está permitido.', error: 'Usa un archivo CSV o de hoja de cálculo.' });
      return;
    }

    setIsImporting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/finanzas/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult({
          success: false,
          message: 'No se pudieron importar los movimientos',
          error: 'Revisa que el archivo incluya las columnas indicadas y vuelve a intentarlo.',
        });
        return;
      }

      setResult({
        success: true,
        message: payload.message || 'Movimientos importados correctamente',
        imported: payload.imported,
      });
    } catch {
      setResult({
        success: false,
        message: 'No se pudo cargar el archivo.',
        error: 'Revisa tu conexión e inténtalo de nuevo.',
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-5 w-5" />
          Importar movimientos financieros
        </CardTitle>
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
          <p className="mt-1 text-sm text-muted-foreground">Archivo CSV o de hoja de cálculo</p>
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
          <p className="mb-2 font-semibold">Columnas del archivo:</p>
            <div className="rounded bg-muted p-2 font-mono text-sm">
              FECHA | DESCRIPCIÓN | MONTO | TIPO | CATEGORÍA | CENTRO DE COSTO
            </div>
          </AlertDescription>
        </Alert>

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
              {result.imported !== undefined ? <p className="mt-1 text-sm">Movimientos agregados: {result.imported}</p> : null}
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

        <Button variant="outline" className="w-full" type="button" onClick={() => fileInputRef.current?.click()}>
          Seleccionar archivo
        </Button>
      </CardContent>
    </Card>
  );
}

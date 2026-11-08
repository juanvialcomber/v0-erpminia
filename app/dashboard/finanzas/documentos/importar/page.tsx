'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, FileText } from 'lucide-react';
import { DocumentUpload } from '@/components/documents/document-upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function FinanzasDocumentosImportarPage() {
  const params = useSearchParams();
  const bankEvidence = params.get('source') === 'bank-evidence';
  const [uploadedName, setUploadedName] = useState('');

  const handleUploadSuccess = (_documentId: string, fileName: string) => {
    setUploadedName(fileName);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Importar documentos de finanzas</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            {bankEvidence
              ? 'Carga una cartola bancaria actual o respaldo equivalente para cerrar la brecha de conciliación banco vs pagos.'
              : 'Ruta dedicada para cargar políticas, procedimientos, respaldos y anexos documentales del módulo financiero.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/finanzas/importar">Importador tabular</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/finanzas/documentos">
              <ArrowRight className="mr-2 h-4 w-4" />
              Volver a documentos
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Subir documento financiero
          </CardTitle>
          <CardDescription>
            Acepta PDF, Word y Excel. El archivo queda asociado al módulo finanzas para revisión y trazabilidad.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bankEvidence ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <p className="font-medium">Evidencia bancaria requerida</p>
              <p className="mt-1 text-muted-foreground">
                Sube la cartola o respaldo bancario más reciente y selecciona el tipo “Cartola bancaria”. El archivo se conserva como evidencia financiera; cargarlo no marca pagos como conciliados ni modifica Laudus automáticamente.
              </p>
            </div>
          ) : null}
          <DocumentUpload module="finanzas" category="documentos" onUploadSuccess={handleUploadSuccess} />
          {uploadedName ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Ultimo archivo cargado: <span className="font-medium text-foreground">{uploadedName}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

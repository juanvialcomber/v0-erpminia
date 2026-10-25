'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, FileText } from 'lucide-react';
import { DocumentUpload } from '@/components/documents/document-upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function FinanzasDocumentosImportarPage() {
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
            Sube políticas, procedimientos y respaldos para que queden asociados a Finanzas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/finanzas/importar">Importar movimientos</Link>
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
            Puedes subir archivos PDF, Word y Excel. Quedarán guardados en Finanzas para que puedas consultarlos después.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DocumentUpload module="finanzas" category="documentos" onUploadSuccess={handleUploadSuccess} />
          {uploadedName ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Último archivo cargado: <span className="font-medium text-foreground">{uploadedName}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

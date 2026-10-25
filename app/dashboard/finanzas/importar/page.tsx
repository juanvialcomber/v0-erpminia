'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Download, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MovementsImport } from '@/components/finanzas/movements-import';

const issueCopy: Record<string, { title: string; description: string }> = {
  zero_amount_lines: {
    title: 'Revisar líneas con monto cero',
    description: 'Hay movimientos con monto cero. Confirma el valor con el documento original antes de corregirlos o volver a cargar el archivo.',
  },
  validation: {
    title: 'Revisar datos financieros',
    description: 'Hay datos pendientes de revisión. Compáralos con el archivo y el respaldo contable antes de volver a cargarlo.',
  },
};

export default function FinanzasImportPage() {
  const params = useSearchParams();
  const issue = params.get('issue');
  const issueContext = issue ? issueCopy[issue] : null;

  const downloadTemplate = () => {
    const headers = ['FECHA', 'DESCRIPCIÓN', 'MONTO', 'TIPO', 'CATEGORÍA', 'CENTRO DE COSTO'];
    const rows = [
      ['2026-06-27', 'Venta de mineral', '1500000', 'ingreso', 'operacion', ''],
      ['2026-06-27', 'Compra repuestos', '250000', 'egreso', 'mantenimiento', 'cc-001'],
    ];
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-movimientos-financieros.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Importar movimientos financieros</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Carga ingresos y gastos desde un archivo. Incluye la fecha, el detalle, el monto y el centro de costo para conservar el historial.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Plantilla Excel
          </Button>
          <Button asChild>
            <Link href="/dashboard/finanzas">
              <ArrowRight className="mr-2 h-4 w-4" />
              Volver a finanzas
            </Link>
          </Button>
        </div>
      </div>

      {issueContext ? <Card className="border-primary/30 shadow-none"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><div><p className="text-sm font-medium">{issueContext.title}</p><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{issueContext.description}</p></div></div><Button asChild size="sm" variant="outline"><Link href="/dashboard/acciones">Mis acciones</Link></Button></CardContent></Card> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-[var(--brand-verde)]" />
            Preparar archivo
          </CardTitle>
          <CardDescription>Incluye estas columnas: fecha, detalle, monto, tipo, categoría y centro de costo.</CardDescription>
        </CardHeader>
        <CardContent>
          <MovementsImport />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uso recomendado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Descarga los movimientos desde tu sistema contable o banco.</p>
          <p>2. En la columna “Tipo”, escribe “ingreso” o “egreso”.</p>
          <p>3. Selecciona el archivo para agregar los movimientos a MOTIL.</p>
          <p>4. Vuelve al resumen para revisar ingresos, gastos y saldo.</p>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { ExportReportForm } from '@/components/reportes/export-report-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ReportSummary = {
  total: number;
  pending: number;
  status: string;
};

export default function ReportesPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadSummary = async () => {
    setIsLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/documents/stats', { credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error('No fue posible cargar el resumen documental');

      // DocumentService.getDashboardStats returns { total, pending, approved, expired }.
      // Missing or invalid counts must not be presented as real zeroes.
      const validCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
      if (!validCount(payload.total) || !validCount(payload.pending)) {
        throw new Error('Resumen documental sin conteos válidos');
      }
      const pending = payload.pending as number;
      const total = payload.total as number;
      setSummary({
        total,
        pending,
        status: total === 0 ? 'Sin documentos' : pending > 0 ? 'Con pendientes' : 'Operativo',
      });
    } catch {
      setSummary(null);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  const summaryValue = (field: 'total' | 'pending') => isLoading || !summary ? '—' : summary[field].toLocaleString('es-CL');

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Gestión transversal · Análisis y exportación
        </p>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reportes</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Exporta información operacional y revisa pendientes documentales antes de descargar.
          </p>
        </div>
      </header>

      {error && (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">No fue posible cargar el resumen documental.</p>
                <p className="text-muted-foreground">El generador de reportes sigue disponible. Los conteos permanecen sin dato hasta recuperar la fuente.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => void loadSummary()}>Reintentar</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-primary" />
              Documentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{summaryValue('total')}</div>
            <p className="mt-1 text-xs text-muted-foreground">Disponibles para reporte</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-primary">{summaryValue('pending')}</div>
            <p className="mt-1 text-xs text-muted-foreground">Requieren revisión</p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-secondary" />
              Fuente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{isLoading ? 'Sincronizando' : summary?.status || 'No disponible'}</div>
            <p className="mt-1 text-xs text-muted-foreground">Estado del resumen documental</p>
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <ExportReportForm />
      </div>
    </div>
  );
}

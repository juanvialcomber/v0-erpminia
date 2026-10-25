'use client';

import { useState } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const REPORT_TYPES = [
  { value: 'maintenance', label: 'Órdenes de mantenimiento' },
  { value: 'hse', label: 'Incidentes y observaciones de seguridad' },
  { value: 'audit', label: 'Movimientos e historial' },
];

export function ExportReportForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportType, setReportType] = useState('maintenance');
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const handleExport = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/reportes/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_type: reportType,
          start_date: startDate,
          end_date: endDate,
        }),
      });

      if (res.ok) {
        const { report } = await res.json();
        const filename = `${reportType}-reporte-${new Date().toISOString().split('T')[0]}.csv`;
        alert(`Reporte generado correctamente.\nRegistros: ${report.row_count}\nArchivo: ${filename}`);
      } else {
        setError('No se pudo generar el reporte');
      }
    } catch {
      console.error('[v0] Export error:', err);
        setError('No se pudo descargar el archivo. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/60 bg-card/90">
      <CardHeader>
        <CardTitle>Exportar reporte</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 flex gap-2 rounded border border-red-200 bg-red-50 p-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold">Tipo de reporte</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {REPORT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold">Desde</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Hasta</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>

          <Button onClick={handleExport} disabled={loading} className="w-full gap-2">
            <Download className="h-4 w-4" />
            {loading ? 'Preparando...' : 'Descargar archivo'}
          </Button>

          <p className="text-xs text-muted-foreground">
            El archivo incluirá la información del rango de fechas seleccionado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

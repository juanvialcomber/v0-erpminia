'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type QueueRow = {
  id: string;
  documentNumber: string | null;
  supplierName: string | null;
  supplierMatched: boolean;
  motilSupplierId: string | null;
  motilSupplierName: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  outstandingAmount: number;
  paymentStatus: string | null;
  overdueDays: number;
  priorityScore: number;
  priority: 'high' | 'medium' | 'low';
  evidence: string[];
  nextAction: string;
};

type Payload = {
  summary: {
    openDocuments: number;
    matchedSupplierDocuments: number;
    unresolvedSupplierDocuments: number;
    overdueDocuments: number;
    highPriorityDocuments: number;
    outstandingTotal: number;
    supplierCoverage: number;
  };
  queue: QueueRow[];
  method: {
    identity: string;
    ranking: string;
    poMatching: string;
    automaticPromotion: false;
    humanReviewRequired: true;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la revisión financiera.');
  return payload;
};

const money = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);

const priorityLabel: Record<QueueRow['priority'], string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export function LaudusFinanceReviewCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/finance-review',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) return null;

  const summary = data?.summary;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Revisión priorizada de obligaciones</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          MOTIL ordena qué revisar primero usando vencimiento, saldo, estado de pago e identidad del proveedor. No crea CxP automáticamente.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !summary ? '—' : summary.openDocuments.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Documentos con saldo</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !summary ? '—' : summary.supplierCoverage.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + '%'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Proveedor identificado</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !summary ? '—' : summary.overdueDocuments.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Con vencimiento pasado</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !summary ? '—' : money(summary.outstandingTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Saldo fuente Laudus</p>
        </div>
      </div>

      <div className="border-t px-4 py-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium">Primero revisar</p>
            <p className="text-xs text-muted-foreground">
              Casos de mayor impacto y antigüedad. La evidencia se presenta antes de cualquier decisión.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {isLoading || !summary ? '—' : summary.highPriorityDocuments.toLocaleString('es-CL') + ' prioridad alta'}
          </p>
        </div>

        <div className="mt-3 divide-y rounded-lg border">
          {isLoading ? <p className="p-4 text-sm text-muted-foreground">Priorizando evidencia…</p> : null}
          {!isLoading && data?.queue.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No hay obligaciones Laudus pendientes de revisión.</p>
          ) : null}
          {data?.queue.slice(0, 5).map((row) => (
            <div key={row.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {row.supplierName || 'Proveedor sin nombre'} · {row.documentNumber || 'Documento sin número'}
                  </p>
                  <Badge variant="outline">{priorityLabel[row.priority]}</Badge>
                  {row.supplierMatched ? (
                    <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Proveedor identificado</Badge>
                  ) : (
                    <Badge variant="outline"><AlertTriangle className="mr-1 h-3.5 w-3.5" />Identidad pendiente</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saldo {money(row.outstandingAmount)} · {row.overdueDays > 0 ? row.overdueDays.toLocaleString('es-CL') + ' días vencido' : 'no vencido'} · {row.paymentStatus === 'partially_paid' ? 'pago parcial' : 'sin pago aplicado'}
                </p>
                <p className="mt-1 text-xs">{row.nextAction}</p>
              </div>
              <div className="text-left lg:text-right">
                <p className="text-xs text-muted-foreground">Prioridad</p>
                <p className="text-lg font-semibold tabular-nums">{row.priorityScore}/100</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

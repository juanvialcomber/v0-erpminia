'use client';

import useSWR from 'swr';
import { FileText, ShieldCheck, ReceiptText } from 'lucide-react';

type DteRow = {
  id: string;
  dteType: number;
  folio: number | null;
  issueDate: string | null;
  recipientName: string | null;
  recipientRut: string | null;
  netAmount: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  siiTrackId: string | null;
  siiStatus: string | null;
  paymentStatus: string | null;
};

type DtcResponse = {
  schemaReady: boolean;
  source: 'SII';
  readOnly: true;
  rows: DteRow[];
  summary: {
    total: number;
    accepted: number;
    pending: number;
    rejected: number;
  };
};

const fetcher = async (url: string): Promise<DtcResponse> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar Facturación SII');
  return payload;
};

const money = (value: number | null) =>
  value === null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

const statusLabel = (status: string | null) => {
  if (!status) return 'Sin estado';
  if (status === 'EPR') return 'Procesado';
  if (status === 'ACEPTADO') return 'Aceptado';
  if (status === 'RECHAZADO') return 'Rechazado';
  return status;
};

export default function FacturacionPage() {
  const { data, error, isLoading } = useSWR<DtcResponse>('/api/finance/dtc', fetcher);
  const rows = data?.rows || [];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Finanzas · DTC</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Facturación SII</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">DTE emitidos, estado SII y conciliación financiera, sin mezclar la autoridad tributaria con el ERP.</p>
        </div>
        <button type="button" disabled className="inline-flex h-9 w-fit items-center gap-2 rounded-md border px-3 text-sm font-medium text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60">
          <ReceiptText className="h-4 w-4" />
          Nueva factura
        </button>
      </section>

      {!data?.schemaReady && !isLoading ? (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold">DTC preparado, persistencia pendiente</h2>
              <p className="mt-1 text-sm text-muted-foreground">La interfaz y el contrato API están activos en preview. La base SII todavía no se aplica a producción, por lo que no se muestran DTE persistidos ni se habilita emisión.</p>
            </div>
          </div>
        </section>
      ) : null}

      {error ? <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error.message}</div> : null}

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['DTE registrados', data?.summary.total ?? null],
          ['Aceptados', data?.summary.accepted ?? null],
          ['Pendientes', data?.summary.pending ?? null],
          ['Rechazados', data?.summary.rejected ?? null],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{isLoading || value === null ? '—' : String(value)}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Documentos tributarios</h2>
            <p className="text-xs text-muted-foreground">SII es la fuente de autoridad tributaria. Laudus se usará para el estado contable y de pago.</p>
          </div>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>

        {!isLoading && rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Todavía no hay DTE persistidos en MOTIL.</div>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[90px_120px_1fr_140px_140px_120px] lg:items-center">
                <span className="font-medium">Folio {row.folio ?? '—'}</span>
                <span className="text-muted-foreground">{row.issueDate || '—'}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.recipientName || 'Sin receptor'}</p>
                  <p className="text-xs text-muted-foreground">{row.recipientRut || '—'}</p>
                </div>
                <span className="font-semibold tabular-nums lg:text-right">{money(row.totalAmount)}</span>
                <span className="text-muted-foreground">SII: {statusLabel(row.siiStatus)}</span>
                <span className="text-muted-foreground">Pago: {row.paymentStatus || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">Frontera de confianza</h2>
        <p className="mt-1 text-muted-foreground">DTC registrará el DTE, Track ID y estados entregados por SII. MOTIL no fabricará estados tributarios. La firma y emisión automática seguirán deshabilitadas hasta validar certificado, folios/CAF, XML, idempotencia y ambiente de certificación.</p>
      </section>
    </div>
  );
}

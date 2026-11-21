'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';

type ReconciliationRow = {
  id: string;
  documentType: string | null;
  folio: string | null;
  direction: 'inbound_invoice' | 'outbound_invoice' | 'purchase_invoice_issued' | 'purchase_invoice_role_conflict' | 'waybill' | 'other';
  counterpartyTaxId: string | null;
  issuedDate: string | null;
  laudus: { status: string; total: number | null; currency: string | null };
  motil: { status: 'match' | 'difference' | 'missing' | 'not_modeled' | 'not_comparable'; total: number | null; currency: string | null };
  sii: { status: 'pending_connection' | 'certificate_configured_document_read_unavailable'; certificateConfigured: boolean; writesEnabled: false };
};

type ReconciliationResponse = {
  generatedAt?: string;
  summary?: {
    documents?: number;
    matches?: number;
    differences?: number;
    missingInMotil?: number;
    outboundNotModeled?: number;
    nonComparable?: number;
    siiConnected?: boolean;
  };
  rows?: ReconciliationRow[];
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la conciliación tributaria');
  return payload;
};

function money(value: number | null, currency: string | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  const code = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'CLP';
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: code, maximumFractionDigits: code === 'CLP' ? 0 : 2 }).format(value);
  } catch {
    return String(value);
  }
}

function directionLabel(value: ReconciliationRow['direction']) {
  if (value === 'inbound_invoice') return 'Factura recibida';\n  if (value === 'purchase_invoice_issued') return 'Factura de compra emitida';\n  if (value === 'purchase_invoice_role_conflict') return 'Factura de compra · validar emisor';
  if (value === 'outbound_invoice') return 'Factura emitida';
  if (value === 'waybill') return 'Guía';
  return 'Otro DTE';
}

function motilLabel(value: ReconciliationRow['motil']['status']) {
  if (value === 'match') return 'Coincide';
  if (value === 'difference') return 'Diferencia';
  if (value === 'missing') return 'Sin candidato por folio';
  if (value === 'not_modeled') return 'Aún no modelado';
  return 'No comparable';
}

function motilVariant(value: ReconciliationRow['motil']['status']) {
  if (value === 'match') return 'secondary' as const;
  if (value === 'difference' || value === 'missing') return 'destructive' as const;
  return 'outline' as const;
}

export function TaxReconciliationCard() {
  const { data, error, isLoading } = useSWR<ReconciliationResponse>(
    '/api/finance/tax-reconciliation',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30 * 60 * 1000 },
  );

  const rows = data?.rows || [];
  const summary = data?.summary;

  return (
    <section className="overflow-hidden rounded-lg border bg-card" aria-label="Conciliación tributaria">
      <div className="flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Laudus · MOTIL · SII</p>
          <h2 className="mt-1 text-lg font-semibold">Conciliación tributaria</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Presenta candidatos por folio entre Laudus y MOTIL. No confirma identidad tributaria ni aceptación del SII.
          </p>
        </div>
        <Badge variant={summary?.siiConnected ? 'secondary' : 'outline'}>
          {summary?.siiConnected ? 'Certificado configurado' : 'SII pendiente'}
        </Badge>
      </div>

      {error ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">{error.message}</p>
      ) : isLoading ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">Conciliando fuentes…</p>
      ) : (
        <>
          <div className="grid gap-px border-b bg-border sm:grid-cols-4">
            {[
              ['Documentos', summary?.documents || 0],
              ['Sin verificar', summary?.nonComparable || 0],
              ['Sin candidato', summary?.missingInMotil || 0],
              ['Lectura SII', 'Pendiente'],
            ].map(([label, value]) => (
              <div key={label} className="bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[840px]">
              <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Documento</span>
                <span>Laudus</span>
                <span>MOTIL</span>
                <span>SII</span>
              </div>
              {rows.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No hay DTE Laudus para conciliar todavía.</p>
              ) : rows.map((row) => (
                <div key={row.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 border-b px-4 py-4 text-sm last:border-b-0">
                  <div className="min-w-0">
                    <p className="font-medium">{directionLabel(row.direction)} · {row.folio || 's/folio'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.documentType || 'DTE'}{row.counterpartyTaxId ? ' · ' + row.counterpartyTaxId : ''}
                    </p>
                  </div>
                  <div>
                    <Badge variant="secondary">Disponible</Badge>
                    <p className="mt-2 text-xs tabular-nums text-muted-foreground">{money(row.laudus.total, row.laudus.currency)}</p>
                  </div>
                  <div>
                    <Badge variant={motilVariant(row.motil.status)}>{motilLabel(row.motil.status)}</Badge>
                    <p className="mt-2 text-xs tabular-nums text-muted-foreground">{money(row.motil.total, row.motil.currency)}</p>
                  </div>
                  <div>
                    <Badge variant="outline">
                      {row.sii.certificateConfigured ? 'Certificado configurado' : 'Pendiente conexión'}
                    </Badge>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {row.sii.certificateConfigured ? 'Lectura DTE SII pendiente de implementar' : 'Requiere certificado propio de La Patagua'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <details className="border-t px-4 py-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">Criterio de conciliación</summary>
            <p className="mt-2 max-w-4xl">
              El folio permite identificar candidatos, pero no acredita identidad entre facturas. Hasta verificar emisor, receptor, tipo, folio y monto, los candidatos quedan sin conciliar. Las facturas emitidas no se comparan con compras; las guías no son facturas. Un certificado configurado no implica lectura ni aceptación SII.
            </p>
          </details>
        </>
      )}
    </section>
  );
}

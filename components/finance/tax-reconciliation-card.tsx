'use client';

import { useState } from 'react';
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
  motil: { status: 'missing' | 'not_modeled' | 'not_comparable'; total: number | null; currency: string | null };
  sii: { status: 'pending_connection' | 'certificate_configured_document_read_unavailable'; certificateConfigured: boolean; writesEnabled: false };
};

type TaxCoreDocument = {
  tenantRut: string;
  issuerRut: string;
  receiverRut: string;
  tenantRole: 'issuer' | 'receiver' | 'both';
  type: number;
  folio: number;
  issuedAt: string;
  total: number;
  identity: string;
  sha256: string;
  validation: {
    officialSiiXsd: 'PASS' | 'FAIL' | 'UNAVAILABLE';
    documentSignature: 'NOT_CHECKED';
    ted: 'NOT_CHECKED';
    siiAcceptance: 'NOT_CHECKED';
  };
};

type TaxCoreRead = {
  status: 'available' | 'unavailable';
  period: string | null;
  documents: TaxCoreDocument[];
  hasMore: boolean;
  nextCursor: string | null;
  invalidDocuments: number;
};

type ReconciliationResponse = {
  taxCore?: TaxCoreRead;
  generatedAt?: string;
  summary?: {
    documents?: number;
    missingInMotil?: number;
    outboundNotModeled?: number;
    nonComparable?: number;
    siiConnected?: boolean;
    taxCoreDocuments?: number;
    taxCoreXsdFailures?: number;
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
  if (value === 'inbound_invoice') return 'Factura recibida';
  if (value === 'purchase_invoice_issued') return 'Factura de compra emitida';
  if (value === 'purchase_invoice_role_conflict') return 'Factura de compra · validar emisor';
  if (value === 'outbound_invoice') return 'Factura emitida';
  if (value === 'waybill') return 'Guía';
  return 'Otro DTE';
}

function motilLabel(value: ReconciliationRow['motil']['status']) {
  if (value === 'missing') return 'Sin candidato por folio';
  if (value === 'not_modeled') return 'Aún no modelado';
  return 'No comparable';
}

function motilVariant(value: ReconciliationRow['motil']['status']) {
  if (value === 'missing') return 'destructive' as const;
  return 'outline' as const;
}

export function TaxReconciliationCard() {
  const [extraDtes, setExtraDtes] = useState<TaxCoreDocument[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const { data, error, isLoading } = useSWR<ReconciliationResponse>(
    '/api/finance/tax-reconciliation',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30 * 60 * 1000 },
  );

  const rows = data?.rows || [];
  const summary = data?.summary;
  const taxCore = data?.taxCore;
  const sourceDtes = [...(taxCore?.documents || []), ...extraDtes]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.sha256 === item.sha256) === index);
  const cursor = nextCursor === undefined ? taxCore?.nextCursor ?? null : nextCursor;
  const hasMore = nextCursor === undefined ? Boolean(taxCore?.hasMore) : Boolean(nextCursor);

  async function loadMoreTaxCore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setPageError(null);
    try {
      const response = await fetcher('/api/finance/tax-reconciliation?taxCoreCursor=' + encodeURIComponent(cursor));
      const page = (response as ReconciliationResponse).taxCore;
      if (!page || page.status !== 'available') throw new Error('No se pudo cargar la siguiente página de Tax Core');
      setExtraDtes((current) => [...current, ...page.documents]);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setPageError(loadError instanceof Error ? loadError.message : 'No se pudo cargar más DTE');
    } finally {
      setLoadingMore(false);
    }
  }

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
              ['Sin candidato por folio', summary?.missingInMotil || 0],
              ['Lectura SII', 'Pendiente'],
            ].map(([label, value]) => (
              <div key={label} className="bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="border-b px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">XML recibidos en Tax Core</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {taxCore?.status === 'available'
                    ? `${sourceDtes.length} metadatos · solo lectura · organización La Patagua`
                    : 'Lectura no disponible; el puente permanece apagado o sin credenciales.'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  XSD oficial solo indica estructura. Firma del documento, TED y aceptación SII: no verificadas.
                </p>
              </div>
              {taxCore?.status === 'available' && (
                <Badge variant={sourceDtes.some((document) => document.validation.officialSiiXsd === 'FAIL') ? 'destructive' : 'outline'}>
                  {sourceDtes.filter((document) => document.validation.officialSiiXsd === 'FAIL').length} XSD con error
                </Badge>
              )}
            </div>
            {sourceDtes.length > 0 && (
              <div className="mt-3 divide-y rounded-md border">
                {sourceDtes.map((document) => (
                  <div key={document.sha256} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">Tipo {document.type} · Folio {document.folio}</p>
                      <p className="text-xs text-muted-foreground">
                        {document.issuedAt} · {document.tenantRole === 'issuer' ? 'Emitido por La Patagua' : document.tenantRole === 'receiver' ? 'Recibido por La Patagua' : 'La Patagua en ambos roles'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs tabular-nums text-muted-foreground">{money(document.total, 'CLP')}</span>
                      <Badge variant={document.validation.officialSiiXsd === 'PASS' ? 'secondary' : document.validation.officialSiiXsd === 'FAIL' ? 'destructive' : 'outline'}>
                        XSD {document.validation.officialSiiXsd === 'PASS' ? 'válido' : document.validation.officialSiiXsd === 'FAIL' ? 'con errores' : 'no disponible'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {taxCore?.invalidDocuments ? <p className="mt-2 text-xs text-amber-700">Se omitieron {taxCore.invalidDocuments} registros con metadatos inválidos.</p> : null}
            {pageError && <p role="alert" className="mt-2 text-xs text-destructive">{pageError}</p>}
            {hasMore && (
              <button type="button" onClick={loadMoreTaxCore} disabled={loadingMore} className="mt-3 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">
                {loadingMore ? 'Cargando…' : 'Cargar más DTE'}
              </button>
            )}
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

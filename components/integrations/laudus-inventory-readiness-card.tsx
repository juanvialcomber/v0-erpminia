'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Boxes, GitCompareArrows, History, RefreshCw, ShieldCheck, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type Payload = {
  stock: {
    rows: number;
    productCoverage: number;
    physicalCountCoverage: number;
  };
  snapshot: {
    rows: number;
    warehouseCoverage: number;
    latestDate: string | null;
    negativeRows: number;
  };
  movementCount: number;
  laudus: {
    products: number;
    eligibleProducts: number;
    excludedProducts: number;
    canonicalProductCoverage: number;
    stockRows: number;
    warehouses: number;
    physicalWarehouses: number;
    mappedPhysicalWarehouses: number;
    latestStockSync: string | null;
    latestMotilStockUpdate: string | null;
    stockIsStale: boolean;
    openReconciliation: number;
    comparedProducts: number;
    alignedProducts: number;
    quantityMismatches: number;
    missingInMotilNonzero: number;
    laudusOnlyZero: number;
    negativeProducts: number;
    negativeWarehouses: number;
    negativePositions: Array<{
      productId: string;
      sku: string;
      description: string;
      unit: string;
      totalStock: number;
      warehouseCode: string;
      warehouseName: string;
      warehouseStock: number;
      sourceDate: string | null;
      syncedAt: string | null;
    }>;
  };
  authority: {
    state: string;
    reason: string;
    laudusIsPrimary: boolean;
    latestEmailStockCutoff: string | null;
    latestEmailPendingReconciliation: number;
    latestWhatsappStockEvidence: string | null;
    whatsappStockEvidenceSinceLaudus: number;
  };
  reconciliation: {
    state: 'waiting_laudus' | 'ready_to_compare' | 'review';
    defaultAbsoluteTolerance: number;
    requiresApprovedTolerance: boolean;
    physicalCountUsedAsEvidence: boolean;
    autoApply: false;
  };
  policy: {
    primaryStockSource: 'laudus' | 'reconciliation';
    laudusStockRole: 'primary_when_consistent';
    motilOperationalStockRole: 'comparison_evidence';
    crossSourceValidation: readonly ['official_email', 'whatsapp'];
    autoOverwrite: false;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular preparación de inventario.');
  return payload;
};

const pct = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;
const count = (value: number) => value.toLocaleString('es-CL');
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(value))
  : 'Sin sincronización';

const reconciliationLabel: Record<Payload['reconciliation']['state'], string> = {
  waiting_laudus: 'Esperando stock Laudus',
  ready_to_compare: 'Conectado · conciliado',
  review: 'Conectado · requiere conciliación',
};

export function LaudusInventoryReadinessCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/inventory-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  const [kardexLoading, setKardexLoading] = useState<string | null>(null);
  const [kardexMessage, setKardexMessage] = useState<Record<string, string>>({});

  async function loadKardex(productId: string, sku: string) {
    if (!productId || kardexLoading) return;
    setKardexLoading(productId);
    setKardexMessage((current) => ({ ...current, [sku]: 'Consultando Kardex…' }));
    try {
      const response = await fetch('/api/integrations/laudus/kardex-sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = response.status === 403
          ? 'Requiere permiso de administración.'
          : payload?.error || 'No fue posible consultar el Kardex.';
        setKardexMessage((current) => ({ ...current, [sku]: message }));
        return;
      }
      const movements = Number(payload?.movements || 0);
      setKardexMessage((current) => ({
        ...current,
        [sku]: movements > 0
          ? `Kardex cargado · ${movements.toLocaleString('es-CL')} movimiento${movements === 1 ? '' : 's'}.`
          : 'Kardex consultado · sin movimientos devueltos.',
      }));
    } catch {
      setKardexMessage((current) => ({ ...current, [sku]: 'No fue posible consultar el Kardex.' }));
    } finally {
      setKardexLoading(null);
    }
  }

  if (error) {
    return (
      <section className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium">Laudus · inventario no disponible</p>
            <p className="mt-1 text-xs text-muted-foreground">MOTIL no pudo verificar la evidencia ERP. No se oculta el error ni se asume que el stock está sincronizado.</p>
          </div>
        </div>
      </section>
    );
  }

  const sourceState = isLoading
    ? 'syncing'
    : data?.reconciliation.state === 'waiting_laudus'
      ? 'pending'
      : data?.reconciliation.state === 'review'
        ? 'review'
        : 'connected';

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Laudus · inventario ERP</h2>
          </div>
          <LaudusSourceMark state={sourceState} />
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Laudus es la fuente primaria de stock cuando está fresco y no existe evidencia oficial contradictoria. Correo y WhatsApp actúan como contraste y abren conciliación antes de aceptar una cifra como vigente.
        </p>
      </div>

      <div className={`border-b px-4 py-3 text-xs ${data?.authority.laudusIsPrimary ? 'bg-emerald-500/5' : 'bg-amber-500/5'}`}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">
            {isLoading || !data
              ? 'Verificando autoridad de stock.'
              : data.authority.laudusIsPrimary
                ? 'Fuente primaria: Laudus'
                : 'Fuente en revisión · Laudus no se usa como verdad única'}
          </p>
          {!isLoading && data?.authority.latestEmailStockCutoff ? (
            <p className="text-muted-foreground">
              Último stock por correo: {data.authority.latestEmailStockCutoff}
            </p>
          ) : null}
        </div>
        <p className="mt-1 text-muted-foreground">
          {isLoading || !data ? 'Comparando Laudus con correo y WhatsApp.' : data.authority.reason}
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : pct(data.laudus.canonicalProductCoverage)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Productos Laudus elegibles enlazados al catálogo</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isLoading || !data ? '—' : `${count(data.laudus.eligibleProducts)} elegibles · ${count(data.laudus.excludedProducts)} fuera de alcance`}
          </p>
        </div>
        <div className="bg-card p-4">
          <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : count(data.laudus.quantityMismatches)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Saldos distintos entre MOTIL y Laudus</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isLoading || !data ? '—' : `${count(data.laudus.missingInMotilNonzero)} SKU con saldo Laudus sin existencia MOTIL · ${count(data.laudus.stockRows)} posiciones ERP`}
          </p>
        </div>
        <div className="bg-card p-4">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : `${data.laudus.mappedPhysicalWarehouses}/${data.laudus.physicalWarehouses}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Bodegas físicas conciliadas con MOTIL</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isLoading || !data ? '—' : `${count(data.laudus.negativeProducts)} SKU Laudus con saldo negativo`}
          </p>
        </div>
        <div className="bg-card p-4">
          <History className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">{isLoading || !data ? '—' : dateTime(data.laudus.latestStockSync)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Última evidencia de stock Laudus</p>
          <p className={`mt-1 text-[11px] ${data?.laudus.stockIsStale ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
            {isLoading || !data ? '—' : data.laudus.stockIsStale ? 'Evidencia con más de 8 horas: refresco requerido.' : 'Evidencia dentro de la ventana de frescura.'}
          </p>
        </div>
      </div>

      {!isLoading && data && data.laudus.negativePositions.length > 0 ? (
        <div className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium">
                {count(data.laudus.negativeProducts)} SKU Laudus con saldo negativo en {count(data.laudus.negativeWarehouses)} bodega{data.laudus.negativeWarehouses === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                La excepción se localiza por bodega. MOTIL no corrige el saldo: primero se revisan movimientos, recepciones, consumos o conteos en Laudus.
              </p>
            </div>
          </div>
          <div className="mt-3 divide-y rounded-md border bg-card">
            {data.laudus.negativePositions.map((row) => (
              <div key={`${row.sku}:${row.warehouseCode}`} className="grid gap-2 px-3 py-2.5 text-xs sm:grid-cols-[120px_1fr_180px_110px_130px] sm:items-center sm:gap-3">
                <span className="font-mono">{row.sku}</span>
                <div className="min-w-0">
                  <span className="block truncate" title={row.description}>{row.description}</span>
                  {kardexMessage[row.sku] ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{kardexMessage[row.sku]}</span> : null}
                </div>
                <span className="text-muted-foreground">{row.warehouseName}</span>
                <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {count(row.warehouseStock)} {row.unit}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={!row.productId || Boolean(kardexLoading)}
                  onClick={() => void loadKardex(row.productId, row.sku)}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${kardexLoading === row.productId ? 'animate-spin' : ''}`} />
                  Kardex
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <GitCompareArrows className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              Estado: {isLoading || !data ? '—' : reconciliationLabel[data.reconciliation.state]}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoading || !data
                ? 'Verificando conciliación.'
                : `${count(data.laudus.alignedProducts)} SKU coinciden · ${count(data.laudus.quantityMismatches)} difieren · ${count(data.laudus.missingInMotilNonzero)} tienen saldo Laudus y no están en existencias MOTIL.`}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.authority.laudusIsPrimary ? 'Laudus primario · validación cruzada activa' : 'Conciliación activa · sin overwrite automático'}
        </p>
      </div>
    </section>
  );
}

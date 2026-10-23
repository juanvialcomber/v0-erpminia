'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, Database, FileText, PackageCheck, Plus, Search, ShoppingCart, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { OperationalPipelineBoard } from '@/components/pipeline/operational-pipeline-board';
import { DataSourceStatusStrip } from '@/components/data/data-source-status-strip';
import { DataReceptionReadiness } from '@/components/data/data-reception-readiness';
import { useDataSourceStatus } from '@/hooks/use-data-source-status';
import { LaudusProcurementReadinessCard } from '@/components/integrations/laudus-procurement-readiness-card';
import { LaudusProcurementReconciliationCard } from '@/components/integrations/laudus-procurement-reconciliation-card';
import { LaudusSupplierResolutionQueueCard } from '@/components/integrations/laudus-supplier-resolution-queue-card';

type Overview = {
  canEdit: boolean;
  canonical: {
    purchaseOrders: number;
    suppliers: number;
  };
  operational: {
    intakeRequests: number;
    operationalOrders: number;
    receipts: number;
    invoices: number;
    accountsPayable: number;
    documents: number;
  };
};

const fetcher = async (url: string): Promise<Overview> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar Compras');
  return payload as Overview;
};

const shortcuts = [
  { href: '/dashboard/compras/control-proveedores/candidatos', label: 'Cotizar', description: 'Comparar proveedores habilitados y candidatos del rubro.', icon: Search },
  { href: '/dashboard/compras/flujo', label: 'Seguimiento', description: 'Revisar solicitudes, órdenes, recepciones y pendientes.', icon: ShoppingCart },
  { href: '/dashboard/compras/proveedores-360', label: 'Proveedores', description: 'Ficha única con historial, contratos, facturas y desempeño.', icon: Users },
  { href: '/dashboard/compras/documentos', label: 'Documentos', description: 'Respaldos de compra vinculados al núcleo documental de MOTIL.', icon: FileText },
];

export default function ComprasPage() {
  const { data, error, isLoading, mutate } = useSWR<Overview>('/api/procurement/overview', fetcher, { revalidateOnFocus: false });
  const sourceStatus = useDataSourceStatus();

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><Link href="/dashboard/compras/calendario" className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Calendario del área →</Link></div>
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Abastecimiento</PageHeaderEyebrow>
          <PageHeaderTitle>Compras</PageHeaderTitle>
          <PageHeaderDescription>Fuente canónica de compras, proveedores y ejecución operacional en un solo flujo.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button asChild>
            <Link href="/dashboard/compras/flujo">{data?.canEdit === true ? <Plus className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}{data?.canEdit === true ? 'Nueva compra' : 'Ver seguimiento'}</Link>
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <DataSourceStatusStrip
        reviewHref="/dashboard/calidad-datos"
        sources={[
          sourceStatus.source('procurement', { key: 'procurement', label: 'Compras', state: 'pending', detail: 'Solicitudes, recepciones, facturas y matching operacional.' }),
          sourceStatus.source('canonical', { key: 'canonical', label: 'Base canónica', state: 'pending', detail: 'Órdenes de compra y proveedores conciliados.' }),
          sourceStatus.source('laudus', { key: 'laudus', label: 'Laudus', state: 'pending', detail: 'Pendiente de habilitación comercial de API.' }),
          { key: 'sii', label: 'SII / DTE', state: 'updated', detail: 'Evidencia fiscal disponible cuando existe un DTE importado.' },
        ]}
      />

      <DataReceptionReadiness
        description="Compras ya separa evidencia canónica y operación. Cuando Laudus sincronice, las OC, proveedores, facturas y pagos entrarán como fuente reconciliable sin reemplazar decisiones humanas."
        items={[
          { label: 'Órdenes y proveedores', ready: true, detail: 'Modelo canónico disponible.' },
          { label: 'Recepciones y facturas', ready: true, detail: 'Flujo operacional disponible.' },
          { label: 'Revisión de diferencias', ready: true, detail: 'Three-way match y excepciones existentes.' },
          { label: 'Laudus', ready: sourceStatus.state('laudus') === 'updated', detail: sourceStatus.state('laudus') === 'updated' ? 'ERP de compras y proveedores sincronizado.' : sourceStatus.state('laudus') === 'review' ? 'Hay datos recibidos que requieren revisión.' : 'Esperando acceso y primera sincronización.' },
        ]}
      />

      <LaudusProcurementReadinessCard />

      <LaudusProcurementReconciliationCard />

      <LaudusSupplierResolutionQueueCard />

      {error ? (
        <StatePanel
          tone="error"
          title="Resumen de Compras no disponible"
          description="Las fuentes faltantes no se reemplazan por cero."
          actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>}
          className="min-h-0"
        />
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-6" aria-label="Resumen de Compras">
        {[
          ['OC canónicas', data?.canonical.purchaseOrders],
          ['Proveedores', data?.canonical.suppliers],
          ['Solicitudes', data?.operational.intakeRequests],
          ['Órdenes operativas', data?.operational.operationalOrders],
          ['Recepciones', data?.operational.receipts],
          ['Facturas', data?.operational.invoices],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-card px-4 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{isLoading || error || typeof value !== 'number' || !Number.isFinite(value) ? '—' : value.toLocaleString('es-CL')}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-2 xl:grid-cols-4" aria-label="Acciones de compras">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group flex items-center gap-4 bg-card px-5 py-4 transition-colors hover:bg-muted/35">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted"><Icon className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1"><p className="font-medium">{item.label}</p><p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p></div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          );
        })}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/dashboard/compras/flujo" className="rounded-lg border p-4 hover:bg-muted/30">
          <PackageCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Flujo operacional</p>
          <p className="mt-1 text-xs text-muted-foreground">{error ? '—' : data?.operational.receipts ?? '—'} recepciones · {error ? '—' : data?.operational.invoices ?? '—'} facturas.</p>
        </Link>
        <Link href="/dashboard/compras/facturas" className="rounded-lg border p-4 hover:bg-muted/30">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Finanzas de proveedor</p>
          <p className="mt-1 text-xs text-muted-foreground">{error ? '—' : data?.operational.accountsPayable ?? '—'} cuentas por pagar registradas.</p>
        </Link>
        <Link href="/dashboard/compras/documentos" className="rounded-lg border p-4 hover:bg-muted/30">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Documentos</p>
          <p className="mt-1 text-xs text-muted-foreground">{error ? '—' : data?.operational.documents ?? '—'} documentos activos en el núcleo documental.</p>
        </Link>
        <Link href="/dashboard/compras/fuentes" className="rounded-lg border p-4 hover:bg-muted/30">
          <Database className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Fuentes</p>
          <p className="mt-1 text-xs text-muted-foreground">Provenance de OC y proveedores canónicos, separando baseline de archivo original.</p>
        </Link>
      </section>

      <section aria-labelledby="compras-pendientes" className="space-y-3">
        <div><h2 id="compras-pendientes" className="text-lg font-semibold tracking-tight">Qué necesita atención</h2><p className="text-sm text-muted-foreground">Pendientes y siguientes pasos del flujo de abastecimiento.</p></div>
        <OperationalPipelineBoard />
      </section>
    </div>
  );
}

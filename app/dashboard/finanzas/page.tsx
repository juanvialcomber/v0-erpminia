import { SharedProjectPortfolio } from '@/components/project-control/shared-project-portfolio';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LaudusFinanceControlCard } from '@/components/integrations/laudus-finance-control-card';
import { LaudusFinanceStatusStrip } from '@/components/integrations/laudus-finance-status-strip';
import { LaudusFinanceReconciliationQueue } from '@/components/integrations/laudus-finance-reconciliation-queue';
import { PurchaseOrderEvidence } from '@/components/finance/purchase-order-evidence';
import { AssetCandidateReviewSignal } from '@/components/finance/asset-candidate-review-signal';

const primarySections = [
  ['/dashboard/finanzas/compras', 'Compras', 'Órdenes, recepciones, facturas y pagos'],
  ['/dashboard/finanzas/conciliacion', 'Conciliación', 'Diferencias y revisión de evidencia'],
  ['/dashboard/finanzas/fuentes/maestro', 'Maestro de costos y producción', 'Indicadores y respaldo del informe de Daniel'],
  ['/dashboard/finanzas/pagos', 'Pagos', 'Vencimientos, pagos y conciliación'],
  ['/dashboard/finanzas/proveedores', 'Proveedores', 'Saldos pendientes por proveedor'],
  ['/dashboard/finanzas/activos', 'Activos', 'Valor, seguro y mantenimiento'],
  ['/dashboard/finanzas/centros', 'Centros de costos', 'Atribución y actividad'],
  ['/dashboard/finanzas/trazabilidad', 'Trazabilidad', 'Respaldo de cifras y movimientos'],
] as const;

const secondarySections = [
  ['/dashboard/finanzas/reportes', 'Reportes'],
  ['/dashboard/finanzas/fuentes', 'Información y respaldo'],
  ['/dashboard/finanzas/documentos', 'Documentos'],
  ['/dashboard/finanzas/calendario', 'Calendario'],
] as const;

export default function FinancePage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-10">
      <section className="px-1 pt-1 sm:px-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Resumen financiero</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Administración y Finanzas</h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-right">
            Revisa compromisos, vencimientos y decisiones de pago.
          </p>
        </div>
      </section>

      <LaudusFinanceReconciliationQueue />
      <SharedProjectPortfolio />

      <section aria-labelledby="finance-readiness-title" className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Control de cierre</p>
            <h2 id="finance-readiness-title" className="mt-1 text-base font-semibold">Estado de la evidencia financiera</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Cada cifra debe conservar fuente, fecha de corte y estado de revisión. Un dato provisional no equivale a un cierre aprobado.
            </p>
          </div>
          <Link href="/dashboard/finanzas/conciliacion" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Abrir cola de conciliación</Link>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Confirmado', 'Fuente y cálculo coinciden.', 'border-emerald-500/30 bg-emerald-500/5'],
            ['Revisar', 'Existe una diferencia concreta.', 'border-amber-500/30 bg-amber-500/5'],
            ['Bloqueado', 'Falta fuente, permiso o evidencia.', 'border-red-500/30 bg-red-500/5'],
            ['Provisional', 'Dato usable con validación pendiente.', 'border-sky-500/30 bg-sky-500/5'],
          ].map(([label, description, tone]) => (
            <div key={label} className={`rounded-md border p-3 ${tone}`}>
              <p className="text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <PurchaseOrderEvidence />
      <LaudusFinanceControlCard />

      <section className="space-y-3" aria-label="Secciones de Finanzas">
        <div className="flex items-end justify-between gap-3 border-t pt-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Secciones</p>
            <h2 className="mt-1 text-base font-semibold">Ir al detalle</h2>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">Una tarea por sección</p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-5">
          {primarySections.map(([href, label, description]) => (
            <Link key={href} href={href} className="group bg-card px-4 py-4 transition-colors hover:bg-primary/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>

        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Más secciones</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Reportes, fuentes, documentos y calendario</p>
            </div>
            <span className="text-xs text-muted-foreground group-open:hidden">Ver</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">Ocultar</span>
          </summary>
          <div className="grid gap-px border-t bg-border sm:grid-cols-2 lg:grid-cols-4">
            {secondarySections.map(([href, label]) => (
              <Link key={href} href={href} className="bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-primary/5">
                <span className="flex items-center justify-between gap-2">
                  {label}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </Link>
            ))}
          </div>
        </details>
      </section>
      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Información de respaldo</summary>
        <div className="space-y-4 border-t p-4">
          <LaudusFinanceStatusStrip />
          <AssetCandidateReviewSignal />
        </div>
      </details>
    </div>
  );
}

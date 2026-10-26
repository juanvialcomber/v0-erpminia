import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LaudusFinanceControlCard } from '@/components/integrations/laudus-finance-control-card';

const primarySections = [
  ['/dashboard/finanzas/pagos', 'Pagos', 'Vencimientos, pagos y conciliación'],
  ['/dashboard/finanzas/proveedores', 'Proveedores', 'Exposición y concentración'],
  ['/dashboard/finanzas/activos', 'Activos', 'Valor, seguro y mantenimiento'],
  ['/dashboard/finanzas/centros', 'Centros de costos', 'Atribución y actividad'],
  ['/dashboard/finanzas/trazabilidad', 'Trazabilidad', 'Origen y evidencia financiera'],
] as const;

const secondarySections = [
  ['/dashboard/finanzas/reportes', 'Reportes'],
  ['/dashboard/finanzas/fuentes', 'Fuentes y calidad'],
  ['/dashboard/finanzas/documentos', 'Documentos'],
  ['/dashboard/finanzas/calendario', 'Calendario'],
] as const;

export default function FinancePage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-10">
      <section className="px-1 pt-1 sm:px-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Finanzas</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Resumen financiero</h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-right">
            Exposición, decisiones y evidencia. El detalle operativo vive en cada sección.
          </p>
        </div>
      </section>

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
    </div>
  );
}

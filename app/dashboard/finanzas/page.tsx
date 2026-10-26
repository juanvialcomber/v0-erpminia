import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LaudusFinanceControlCard } from '@/components/integrations/laudus-finance-control-card';

const primarySections = [
  ['/dashboard/finanzas/pagos', 'Pagos', 'Vencimientos, pagos y conciliación'],
  ['/dashboard/finanzas/proveedores', 'Proveedores', 'Exposición y concentración'],
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
      <section className="border-b px-1 pb-5 pt-1 sm:px-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Finanzas · MOTIL + Laudus</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Resumen financiero</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Estado, decisiones y exposición en una sola lectura. El detalle operativo vive en cada sección.
        </p>
      </section>

      <LaudusFinanceControlCard />

      <section className="space-y-3" aria-label="Secciones de Finanzas">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Secciones</p>
          <h2 className="mt-1 text-lg font-semibold">Ir al detalle</h2>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
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

        <details className="group rounded-xl border bg-card">
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

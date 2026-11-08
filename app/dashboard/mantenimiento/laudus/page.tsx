import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LaudusFinanceReconciliationQueue } from '@/components/integrations/laudus-finance-reconciliation-queue';
import { Card, CardContent } from '@/components/ui/card';

export default function MaintenanceLaudusPage() {
  return (
    <div className="space-y-6">
      <section className="border-b border-border/70 pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Mantenimiento</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Control Laudus</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Vista del líder del proyecto para revisar excepciones Laudus sin reemplazar a los responsables de Bodega o Administración y Finanzas.
        </p>
      </section>

      <Card className="shadow-none">
        <CardContent className="grid gap-px p-0 sm:grid-cols-2">
          <Link href="/dashboard/bodega" className="group px-4 py-4 transition-colors hover:bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Bodega</p>
                <p className="mt-1 text-xs text-muted-foreground">Stock, Kardex y conciliaciones de inventario.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
          <Link href="/dashboard/mantenimiento/activos-laudus" className="group border-t px-4 py-4 transition-colors hover:bg-muted/30 sm:border-l sm:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Activos Laudus</p>
                <p className="mt-1 text-xs text-muted-foreground">Identidad operacional y evidencia de activos.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Administración y Finanzas</p>
          <h2 className="mt-1 text-base font-semibold">Conciliaciones que requieren decisión</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Daniel sigue siendo owner del área. El Jefe de Planificación puede decidir aquí únicamente por su rol de líder del proyecto Laudus.
          </p>
        </div>
        <LaudusFinanceReconciliationQueue />
      </section>
    </div>
  );
}

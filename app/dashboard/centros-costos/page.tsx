import { CostCenterCoverageQueue } from '@/components/dashboard/cost-center-coverage-queue';
import { CostCentersWorkspace } from '@/components/dashboard/cost-centers-workspace';
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from '@/components/ui/page-header';

export const metadata = {
  title: 'Centros de costos | Motil',
  description: 'Control operacional y financiero por centro de costo',
};

export default function CostCentersPage() {
  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Control transversal</PageHeaderEyebrow>
          <PageHeaderTitle>Centros de costos</PageHeaderTitle>
          <PageHeaderDescription>
            Consulta la estructura canónica vigente y resuelve referencias faltantes de Producción, Mantención y Compras sin inferir asignaciones.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      <section className="space-y-3" aria-labelledby="cost-center-actions-title">
        <div>
          <p id="cost-center-actions-title" className="text-sm font-semibold">Pendientes de asignación</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Primero se muestran únicamente los registros que requieren una decisión.
          </p>
        </div>
        <CostCenterCoverageQueue />
      </section>

      <section className="space-y-3" aria-labelledby="cost-center-structure-title">
        <div>
          <p id="cost-center-structure-title" className="text-sm font-semibold">Estructura canónica</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Centros vigentes agrupados por familia, con detalle desplegable sólo cuando se necesita.
          </p>
        </div>
        <CostCentersWorkspace />
      </section>
    </div>
  );
}

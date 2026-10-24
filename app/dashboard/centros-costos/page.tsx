import { CostCenterCoverageQueue } from '@/components/dashboard/cost-center-coverage-queue';
import { LaudusCostCenterReviewQueue } from '@/components/dashboard/laudus-cost-center-review-queue';
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
      <LaudusCostCenterReviewQueue />
      <CostCenterCoverageQueue />
      <CostCentersWorkspace />
    </div>
  );
}

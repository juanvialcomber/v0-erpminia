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
          <PageHeaderEyebrow>Gestión de costos</PageHeaderEyebrow>
          <PageHeaderTitle>Centros de costo</PageHeaderTitle>
          <PageHeaderDescription>
            Revisa la lista de centros de costo y asigna uno a los registros de Producción, Mantención y Compras que aún no lo tienen. Las asignaciones existentes se conservan.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      <CostCenterCoverageQueue />
      <CostCentersWorkspace />
    </div>
  );
}

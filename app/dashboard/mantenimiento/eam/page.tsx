import type { Metadata } from 'next';
import { MaintenanceEamPhaseModel } from '@/components/maintenance/maintenance-eam-phase-model';
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';

export const metadata: Metadata = {
  title: 'Flujo EAM | Mantenimiento',
  description: 'Modelo profesional de planificación, preparación, ejecución, cierre y aprendizaje de mantenimiento.',
};

export default function MaintenanceEamPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Mantenimiento · EAM</PageHeaderEyebrow>
          <PageHeaderTitle>Flujo profesional</PageHeaderTitle>
          <PageHeaderDescription>
            Una sola vista del ciclo de vida de cada OT: backlog, planificación, preparación, ejecución, cierre, revisión y aprendizaje.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      <MaintenanceEamPhaseModel />
    </div>
  );
}

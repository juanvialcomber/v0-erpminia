import { PlantMetallurgyDashboard } from '@/components/production/plant-metallurgy-dashboard';
import { ProductionFineCloseoutGate } from '@/components/production/production-fine-closeout-gate';
import { PlantShiftEvidenceReconciliation } from '@/components/production/plant-shift-evidence-reconciliation';

export default function PlantaMetalurgiaPage() {
  return <div className="space-y-6"><PlantMetallurgyDashboard/><PlantShiftEvidenceReconciliation/><ProductionFineCloseoutGate/></div>;
}

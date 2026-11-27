import { AwardEvidencePanel } from '@/components/procurement/award-evidence-panel';
import { AwardOutcomeLearning } from '@/components/procurement/award-outcome-learning';
import { ProgressiveProcurementWorkflow } from '@/components/procurement/progressive-procurement-workflow';
import { ProcurementEvidenceChain } from '@/components/procurement/procurement-evidence-chain';

export default function ProcurementWorkflowPage() {
  return <div className="space-y-6"><ProcurementEvidenceChain /><AwardEvidencePanel /><AwardOutcomeLearning /><ProgressiveProcurementWorkflow /></div>;
}

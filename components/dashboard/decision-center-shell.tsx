'use client';

import { usePathname } from 'next/navigation';
import { DecisionCasesPanel } from '@/components/dashboard/decision-cases-panel';
import { OperationalDecisionSync } from '@/components/dashboard/operational-decision-sync';
import { DecisionTower } from '@/components/dashboard/decision-tower';
import { ManagementContextNav } from '@/components/layout/management-context-nav';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export function DecisionCenterShell({ dictionary, children }: { dictionary: Dictionary; children: React.ReactNode }) {
  const pathname = usePathname();
  const isDecisionHome = pathname === '/dashboard/decisiones' || pathname === '/dashboard/decisiones/';

  return (
    <div className="space-y-5">
      <ManagementContextNav dictionary={dictionary} />
      {isDecisionHome ? <OperationalDecisionSync /> : null}
      {isDecisionHome ? <DecisionTower /> : null}
      {children}
      {isDecisionHome ? <DecisionCasesPanel /> : null}
    </div>
  );
}

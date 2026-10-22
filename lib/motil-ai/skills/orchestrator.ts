import { getMotilSkill, type MotilSkill } from './catalog';
import { routeOrDefault } from './router';

const RELATED: Record<string, string[]> = {
  'maintenance-cost-trace': ['purchase-price-variance', 'supplier-performance', 'asset-financial-360'],
  'inventory-stock-risk': ['purchase-need-context', 'supplier-performance', 'purchase-price-variance'],
  'procurement-three-way-match': ['dte-procurement-check', 'supplier-performance', 'accounts-payable-exposure'],
  'asset-financial-360': ['maintenance-cost-trace', 'purchase-price-variance'],
  'accounts-payable-exposure': ['supplier-performance', 'cost-center-control'],
  'laudus-source-reconciliation': ['data-quality-guardian'],
};

export type SkillPlan = {
  primary: MotilSkill;
  supporting: MotilSkill[];
  maxSkills: number;
  presentation: {
    showOneConclusionFirst: true;
    showOneNextAction: true;
    progressiveDisclosure: true;
  };
};

export function buildSkillPlan(intent: string, maxSkills = 3): SkillPlan | null {
  const routed = routeOrDefault(intent);
  const primary = routed[0]?.skill;
  if (!primary) return null;

  const selected = new Map<string, MotilSkill>([[primary.key, primary]]);
  for (const route of routed.slice(1)) selected.set(route.skill.key, route.skill);

  for (const key of RELATED[primary.key] || []) {
    if (selected.size >= maxSkills) break;
    const skill = getMotilSkill(key);
    if (skill) selected.set(skill.key, skill);
  }

  const supporting = [...selected.values()].filter((skill) => skill.key !== primary.key).slice(0, Math.max(0, maxSkills - 1));

  return {
    primary,
    supporting,
    maxSkills,
    presentation: {
      showOneConclusionFirst: true,
      showOneNextAction: true,
      progressiveDisclosure: true,
    },
  };
}

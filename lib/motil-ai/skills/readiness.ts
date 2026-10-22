import type { MotilSkill } from './catalog';

export type EvidenceState = {
  availableSources: string[];
  syncedDomains: string[];
};

export type SkillReadiness = {
  ready: boolean;
  missingEvidence: string[];
  missingSyncedData: string[];
  canAct: boolean;
};

export function evaluateSkillReadiness(skill: MotilSkill, state: EvidenceState): SkillReadiness {
  const available = new Set(state.availableSources);
  const synced = new Set(state.syncedDomains);

  const missingEvidence = skill.evidence.filter((source) => !available.has(source));
  const missingSyncedData = (skill.requiresSyncedData || []).filter((domain) => !synced.has(domain));

  return {
    ready: missingEvidence.length === 0 && missingSyncedData.length === 0,
    missingEvidence,
    missingSyncedData,
    canAct: false,
  };
}

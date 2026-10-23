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
  const presentEvidence = skill.evidence.filter((source) => available.has(source));
  const evidenceReady = skill.evidenceMode === 'any'
    ? skill.evidence.length === 0 || presentEvidence.length > 0
    : missingEvidence.length === 0;

  const missingSyncedData = (skill.requiresSyncedData || []).filter((domain) => !synced.has(domain));

  return {
    ready: evidenceReady && missingSyncedData.length === 0,
    missingEvidence,
    missingSyncedData,
    canAct: false,
  };
}

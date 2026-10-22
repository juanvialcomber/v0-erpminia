import { MOTIL_CONTEXTUAL_SKILLS, type MotilSkill } from './catalog';
import { evaluateSkillReadiness, type EvidenceState } from './readiness';

export type SkillAvailability = {
  key: string;
  name: string;
  domain: MotilSkill['domain'];
  state: 'available' | 'degraded' | 'dormant';
  missingEvidence: string[];
  missingSyncedData: string[];
  userVisible: boolean;
};

export function buildSkillAvailability(state: EvidenceState): SkillAvailability[] {
  return MOTIL_CONTEXTUAL_SKILLS.map((skill) => {
    const readiness = evaluateSkillReadiness(skill, state);
    const hasAnyEvidence = skill.evidence.some((source) => state.availableSources.includes(source));
    const hasAnySyncedData = (skill.requiresSyncedData || []).some((domain) => state.syncedDomains.includes(domain));

    const availabilityState: SkillAvailability['state'] = readiness.ready
      ? 'available'
      : hasAnyEvidence || hasAnySyncedData
        ? 'degraded'
        : 'dormant';

    return {
      key: skill.key,
      name: skill.name,
      domain: skill.domain,
      state: availabilityState,
      missingEvidence: readiness.missingEvidence,
      missingSyncedData: readiness.missingSyncedData,
      userVisible: availabilityState !== 'dormant',
    };
  });
}

export function availableSkillKeys(state: EvidenceState): string[] {
  return buildSkillAvailability(state)
    .filter((item) => item.state === 'available')
    .map((item) => item.key);
}

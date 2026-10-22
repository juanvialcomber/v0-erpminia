import type { MotilSkill } from './catalog';

export type SkillResult<T = unknown> = {
  skillKey: string;
  status: 'ready' | 'partial' | 'blocked';
  conclusion: string | null;
  nextAction: string | null;
  evidence: Array<{ source: string; ref?: string; observedAt?: string }>;
  warnings: string[];
  data?: T;
};

export function blockedSkillResult(skill: MotilSkill, missing: string[]): SkillResult {
  return {
    skillKey: skill.key,
    status: 'blocked',
    conclusion: null,
    nextAction: missing.length ? 'Completar evidencia faltante antes de concluir.' : null,
    evidence: [],
    warnings: missing.map((item) => 'Falta: ' + item),
  };
}

export function assertGroundedResult(result: SkillResult): SkillResult {
  if (result.status === 'ready' && result.evidence.length === 0) {
    return {
      ...result,
      status: 'partial',
      conclusion: null,
      warnings: [...result.warnings, 'Resultado degradado: sin evidencia trazable.'],
    };
  }
  return result;
}

'use client';

import useSWR from 'swr';

type SkillState = 'available' | 'degraded' | 'dormant';

type SkillAvailability = {
  key: string;
  name: string;
  domain: string;
  state: SkillState;
  missingEvidence: string[];
  missingSyncedData: string[];
  userVisible: boolean;
};

type Response = {
  generatedAt: string;
  sourceState: { laudus: string };
  summary: { total: number; available: number; degraded: number; dormant: number };
  skills: SkillAvailability[];
  promptsByDomain?: Record<string, string[]>;
};

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular capacidades.');
  return payload;
};

export function useMotilSkillAvailability() {
  const swr = useSWR<Response>('/api/motil-ai/skills/availability', fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
  });

  const stateFor = (key: string): SkillState =>
    swr.data?.skills.find((skill) => skill.key === key)?.state || 'dormant';

  const canUse = (key: string) => stateFor(key) === 'available';
  const promptsFor = (domain: string, fallback: string[]) => {
    const prompts = swr.data?.promptsByDomain?.[domain] || [];
    return prompts.length ? prompts : fallback;
  };

  return { ...swr, stateFor, canUse, promptsFor };
}

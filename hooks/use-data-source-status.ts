'use client';

import useSWR from 'swr';
import type { DataSourceItem, DataSourceState } from '@/components/data/data-source-status-strip';

type SourceResponse = {
  generatedAt: string;
  sources: Array<DataSourceItem & { reviewCount?: number }>;
};

const fetcher = async (url: string): Promise<SourceResponse> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo verificar el estado de las fuentes.');
  return payload;
};

export function useDataSourceStatus() {
  const swr = useSWR<SourceResponse>('/api/data-sources/status', fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
  });

  function source(
    key: string,
    fallback: DataSourceItem,
  ): DataSourceItem & { reviewCount?: number } {
    if (swr.isLoading) return { ...fallback, state: 'syncing' };
    if (swr.error) return { ...fallback, state: 'review', detail: 'No fue posible verificar esta fuente.' };
    return swr.data?.sources.find((item) => item.key === key) || fallback;
  }

  function state(key: string, fallback: DataSourceState = 'pending') {
    return swr.data?.sources.find((item) => item.key === key)?.state || fallback;
  }

  return { ...swr, source, state };
}

'use client';

import useSWR from 'swr';

export type AccessLevel = 'ED' | 'LEC' | 'SR';

export interface ModuleAccessResponse {
  isAdmin: boolean;
  hasCargo: boolean;
  role: string | null;
  access: Record<string, AccessLevel>;
}

const fetcher = async (url: string): Promise<ModuleAccessResponse> => {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    // Unauthenticated or error: deny access. Never fail open.
    return { isAdmin: false, hasCargo: false, role: null, access: {} };
  }
  return res.json();
};

/**
 * Client hook exposing the current user's module access map.
 *
 * Usage:
 *   const { canView, canEdit, getLevel, isAdmin } = useModuleAccess();
 *   if (!canView('hse_epp')) return <NoAccess />;
 *   {canEdit('hse_epp') && <Button>Subir</Button>}
 */
export function useModuleAccess() {
  const { data, error, isLoading } = useSWR<ModuleAccessResponse>(
    '/api/me/access',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const isAdmin = data?.isAdmin ?? false;
  const hasCargo = data?.hasCargo ?? false;
  const access = data?.access ?? {};

  // Only verified admins bypass the module matrix. Missing cargo/access is denied.
  const enforced = !isAdmin;

  const getLevel = (moduleKey: string): AccessLevel => {
    if (!data || error) return 'SR';
    if (!enforced) return 'ED';
    return access[moduleKey] ?? 'SR';
  };

  const canView = (moduleKey: string): boolean => {
    const level = getLevel(moduleKey);
    return level === 'ED' || level === 'LEC';
  };

  const canEdit = (moduleKey: string): boolean => getLevel(moduleKey) === 'ED';

  return {
    isAdmin,
    hasCargo,
    enforced,
    role: data?.role ?? null,
    access,
    getLevel,
    canView,
    canEdit,
    isLoading,
    error,
    // While loading, we don't know yet — callers can use this to avoid flash.
    ready: !isLoading && !error && data !== undefined,
  };
}

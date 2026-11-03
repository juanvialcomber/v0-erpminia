import 'server-only';

const DEFAULT_TAX_CORE_URL = 'https://n3uralia-tax-core.vercel.app';

type TaxCoreRequestInit = RequestInit & { timeoutMs?: number };

function baseUrl() {
  return String(process.env.N3URALIA_TAX_CORE_URL || DEFAULT_TAX_CORE_URL).replace(/\/$/, '');
}

function adminToken() {
  return String(process.env.N3URALIA_TAX_ADMIN_TOKEN || '').trim();
}

async function requestTaxCore(path: string, init: TaxCoreRequestInit = {}) {
  const { timeoutMs = 8000, ...requestInit } = init;
  const headers = new Headers(requestInit.headers || {});
  headers.set('Accept', 'application/json');

  const token = adminToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${baseUrl()}${path}`, {
    ...requestInit,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`N3uralia Tax Core HTTP ${response.status}`) as Error & {
      status?: number;
      payload?: unknown;
    };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function getTaxCoreConfigurationState() {
  return {
    baseUrl: baseUrl(),
    adminTokenConfigured: Boolean(adminToken()),
    mode: 'readiness-validation-only' as const,
    siiWritesRequested: false,
  };
}

export async function getTaxCoreHealth() {
  return requestTaxCore('/api/health');
}

export async function getTaxCoreReadiness() {
  return requestTaxCore('/api/v1/sii/readiness');
}

export async function validateTaxDocument(input: unknown) {
  return requestTaxCore('/api/v1/tax/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

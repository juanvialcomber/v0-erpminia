const DEFAULT_BASE_URL = 'https://api.laudus.cl';
const DEFAULT_USER_NAME = 'Motil';
const DEFAULT_COMPANY_VAT_ID = '84542800-K';

type LaudusCredentials = {
  baseUrl: string;
  userName: string;
  password: string;
  companyVATId: string;
};

type TokenCache = {
  token: string;
  expiresAt: number;
} | null;

let tokenCache: TokenCache = null;

function configuredValue(value: string | undefined) {
  return String(value || '').trim();
}

export function getLaudusConfigurationState() {
  const password = configuredValue(process.env.LAUDUS_PASSWORD);

  const missing = [
    !password ? 'LAUDUS_PASSWORD' : null,
  ].filter((value): value is string => Boolean(value));

  return {
    configured: missing.length === 0,
    missing,
  };
}

function credentials(): LaudusCredentials {
  const state = getLaudusConfigurationState();
  if (!state.configured) {
    throw new Error(`Laudus no está configurado. Faltan: ${state.missing.join(', ')}`);
  }

  return {
    baseUrl: configuredValue(process.env.LAUDUS_BASE_URL) || DEFAULT_BASE_URL,
    userName: configuredValue(process.env.LAUDUS_USER_NAME) || DEFAULT_USER_NAME,
    password: configuredValue(process.env.LAUDUS_PASSWORD),
    companyVATId: configuredValue(process.env.LAUDUS_COMPANY_VAT_ID) || DEFAULT_COMPANY_VAT_ID,
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  if (typeof parsed === 'string') {
    try {
      return JSON.parse(parsed);
    } catch {
      return parsed;
    }
  }

  return parsed;
}

function safeApiError(status: number) {
  if (status === 400) return 'Laudus rechazó la solicitud.';
  if (status === 401) return 'La autenticación Laudus no fue aceptada.';
  if (status === 403) return 'Laudus denegó acceso para este usuario o empresa.';
  if (status === 404) return 'El recurso Laudus solicitado no existe.';
  if (status === 422) return 'Laudus rechazó la solicitud por una validación de negocio.';
  if (status === 429) return 'Laudus alcanzó temporalmente su límite de llamadas.';
  if (status >= 500) return 'Laudus no está disponible temporalmente.';
  return `Laudus respondió con HTTP ${status}.`;
}

function safeUpstreamCode(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  for (const key of ['code', 'errorCode', 'errorNumber']) {
    const candidate = value[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate).slice(0, 80);
  }
  return null;
}

export class LaudusApiError extends Error {
  status: number;
  path: string;
  upstreamCode: string | null;

  constructor(status: number, path: string, upstreamCode: string | null = null) {
    super(safeApiError(status));
    this.name = 'LaudusApiError';
    this.status = status;
    this.path = path;
    this.upstreamCode = upstreamCode;
  }
}

async function request(path: string, init: RequestInit = {}) {
  const { baseUrl } = credentials();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new LaudusApiError(response.status, path, safeUpstreamCode(payload));
  }

  return payload;
}

function tokenFromPayload(payload: unknown): { token: string; expiration?: string } {
  if (typeof payload === 'string' && payload.trim()) {
    return { token: payload.trim() };
  }

  if (payload && typeof payload === 'object') {
    const value = payload as Record<string, unknown>;
    const token = typeof value.token === 'string' ? value.token.trim() : '';
    const expiration = typeof value.expiration === 'string' ? value.expiration : undefined;
    if (token) return { token, expiration };
  }

  throw new Error('Laudus no devolvió un token válido.');
}

export async function getLaudusAccessToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - now > 60_000) {
    return tokenCache.token;
  }

  const { userName, password, companyVATId } = credentials();

  const payload = await request('/security/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName, password, companyVATId }),
  });

  const parsed = tokenFromPayload(payload);
  const parsedExpiration = parsed.expiration ? Date.parse(parsed.expiration) : Number.NaN;

  tokenCache = {
    token: parsed.token,
    expiresAt: Number.isFinite(parsedExpiration) ? parsedExpiration : now + 10 * 60_000,
  };

  return tokenCache.token;
}

type LaudusListQuery = {
  options?: {
    offset?: number;
    limit?: number;
  };
  fields?: string[];
  filterBy?: unknown[];
  orderBy?: unknown[];
};

export async function listLaudus(path: string, query: LaudusListQuery = {}) {
  const token = await getLaudusAccessToken();

  return request(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      options: {
        offset: query.options?.offset ?? 0,
        limit: Math.min(Math.max(query.options?.limit ?? 5, 1), 25),
      },
      fields: query.fields ?? [],
      filterBy: query.filterBy ?? [],
      orderBy: query.orderBy ?? [],
    }),
  });
}

function summarizePayload(payload: unknown) {
  const fieldsOf = (row: unknown) =>
    row && typeof row === 'object' && !Array.isArray(row)
      ? Object.keys(row as Record<string, unknown>).slice(0, 40)
      : [];

  if (Array.isArray(payload)) {
    return { rows: payload.length, shape: 'array' as const, sampleFields: fieldsOf(payload[0]) };
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'rows']) {
      if (Array.isArray(record[key])) {
        const rows = record[key] as unknown[];
        return { rows: rows.length, shape: key, sampleFields: fieldsOf(rows[0]) };
      }
    }
    return { rows: null, shape: 'object' as const, sampleFields: Object.keys(record).slice(0, 40) };
  }

  return { rows: null, shape: typeof payload, sampleFields: [] as string[] };
}

export async function runLaudusReadOnlyValueProbe() {
  await getLaudusAccessToken();

  const targets = [
    ['purchaseInvoices', '/purchases/invoices/list', ['purchaseInvoiceId']],
    ['purchaseOrders', '/purchases/orders/list', ['purchaseOrderId']],
    ['purchasePayments', '/purchases/payments/list', ['paymentId']],
    ['bankStatements', '/accounting/bankStatements/list', ['bankStatementId']],
    ['journalEntries', '/accounting/journal/entries/list', ['journalEntryId']],
    ['fixedAssets', '/purchases/fixedAssets/list', ['fixedAssetId']],
    ['inventories', '/production/inventories/list', ['inventoryId']],
    ['stockTransfers', '/production/stockTransfers/list', ['stockTransferId']],
  ] as const;

  const results: Record<string, {
    status: 'data' | 'empty' | 'unavailable';
    rows: number | null;
    shape: string | null;
    sampleFields: string[];
    upstreamStatus?: number | null;
  }> = {};

  for (const [key, path, fields] of targets) {
    try {
      const payload = await listLaudus(path, { options: { offset: 0, limit: 1 }, fields: [...fields] });
      const summary = summarizePayload(payload);
      results[key] = {
        status: Number(summary.rows || 0) > 0 ? 'data' : 'empty',
        rows: summary.rows,
        shape: summary.shape,
        sampleFields: summary.sampleFields,
      };
    } catch (error) {
      const laudusError = error instanceof LaudusApiError ? error : null;
      results[key] = {
        status: 'unavailable',
        rows: null,
        shape: null,
        sampleFields: [],
        upstreamStatus: laudusError?.status || null,
      };
    }
  }

  return {
    authenticated: true,
    calls: 9,
    persisted: false,
    redacted: true,
    results,
  };
}

export async function runLaudusReadOnlySmokeTest() {
  await getLaudusAccessToken();

  const targets = [
    ['products', '/production/products/list'],
    ['suppliers', '/purchases/suppliers/list'],
    ['warehouses', '/production/warehouses/list'],
    ['costCenters', '/purchases/costcenters/list'],
  ] as const;

  const results: Record<string, { rows: number | null; shape: string }> = {};

  for (const [key, path] of targets) {
    const payload = await listLaudus(path, { options: { offset: 0, limit: 5 } });
    results[key] = summarizePayload(payload);
  }

  return {
    authenticated: true,
    calls: 5,
    persisted: false,
    results,
  };
}

export type LaudusCapability = {
  path: string;
  methods: string[];
  tags: string[];
  domain: 'master_data' | 'inventory' | 'procurement' | 'finance' | 'tax' | 'fixed_assets' | 'hr' | 'sales' | 'unknown';
  writeCapable: boolean;
};

type OpenApiOperation = { tags?: unknown };
type OpenApiPath = Record<string, OpenApiOperation>;
export type OpenApiDocument = { paths?: Record<string, OpenApiPath> };

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const SWAGGER_UI_URL = 'https://api.laudus.cl/swagger/index.html';
const FALLBACK_SPEC_PATHS = [
  '/swagger/v1/swagger.json',
  '/swagger/swagger.json',
  '/swagger/docs/v1',
  '/swagger/v1/openapi.json',
  '/swagger/openapi.json',
  '/openapi.json',
] as const;

function classify(path: string, tags: string[]): LaudusCapability['domain'] {
  const haystack = (path + ' ' + tags.join(' ')).toLowerCase();
  if (/fixed.?asset|depreciation/.test(haystack)) return 'fixed_assets';
  if (/dte|sii|tax|certificate/.test(haystack)) return 'tax';
  if (/sales|quote|sales.?order|sales.?invoice|customer|salesman|receipt/.test(haystack)) return 'sales';
  if (/stock|inventory|kardex|movement|transfer|warehouse|lot|serial/.test(haystack)) return 'inventory';
  if (/purchase|supplier.?invoice|waybill|goods.?receipt/.test(haystack)) return 'procurement';
  if (/accounting|journal|bank|payment|ledger|account|balance/.test(haystack)) return 'finance';
  if (/product|supplier|cost.?center|warehouse/.test(haystack)) return 'master_data';
  if (/employee|remuneration|absence|payroll/.test(haystack)) return 'hr';
  return 'unknown';
}

export function discoverLaudusCapabilities(document: OpenApiDocument): LaudusCapability[] {
  const capabilities: LaudusCapability[] = [];
  for (const [path, operations] of Object.entries(document.paths || {})) {
    const methods = Object.keys(operations).filter((method) =>
      ['get','post','put','patch','delete'].includes(method.toLowerCase()),
    ).map((method) => method.toLowerCase());

    if (!methods.length) continue;

    const tags = [...new Set(methods.flatMap((method) => {
      const raw = operations[method]?.tags;
      return Array.isArray(raw) ? raw.filter((tag): tag is string => typeof tag === 'string') : [];
    }))];

    capabilities.push({
      path,
      methods,
      tags,
      domain: classify(path, tags),
      writeCapable: methods.some((method) => WRITE_METHODS.has(method)),
    });
  }

  return capabilities.sort((a, b) => a.path.localeCompare(b.path));
}

export function readOnlyCapabilities(capabilities: LaudusCapability[]): LaudusCapability[] {
  return capabilities
    .map((capability) => ({
      ...capability,
      methods: capability.methods.filter((method) =>
        method === 'get' || (method === 'post' && capability.path.endsWith('/list')),
      ),
    }))
    .filter((capability) => capability.methods.length > 0);
}

function absoluteSpecUrl(candidate: string) {
  try {
    return new URL(candidate, SWAGGER_UI_URL).toString();
  } catch {
    return null;
  }
}

export function extractLaudusSpecCandidates(html: string) {
  const tokens = html
    .split(/[\s"'<>]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const matches = tokens.filter((token) => {
    const value = token.toLowerCase();
    const looksLikeSpec = value.includes('swagger') || value.includes('openapi');
    const supportedExt = value.endsWith('.json') || value.endsWith('.yaml') || value.endsWith('.yml');
    return looksLikeSpec && supportedExt;
  });

  const urls = [
    ...matches.map(absoluteSpecUrl).filter((value): value is string => Boolean(value)),
    ...FALLBACK_SPEC_PATHS.map((path) => absoluteSpecUrl(path)).filter((value): value is string => Boolean(value)),
  ];
  return [...new Set(urls)];
}

export async function loadLaudusOpenApiDocument(fetchImpl: typeof fetch = fetch) {
  const uiResponse = await fetchImpl(SWAGGER_UI_URL, { cache: 'no-store' });
  const uiHtml = uiResponse.ok ? await uiResponse.text() : '';
  const candidates = extractLaudusSpecCandidates(uiHtml);

  for (const specUrl of candidates) {
    try {
      const response = await fetchImpl(specUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/json, application/yaml, text/yaml, */*' },
      });
      if (!response.ok) continue;
      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const document = parsed as OpenApiDocument;
        if (document.paths && typeof document.paths === 'object') {
          return { specUrl, document, uiStatus: uiResponse.status };
        }
      }
    } catch {
      // Continue through bounded public spec candidates.
    }
  }

  return { specUrl: null, document: null, uiStatus: uiResponse.status };
}

export function summarizeLaudusCapabilities(capabilities: LaudusCapability[]) {
  const safe = readOnlyCapabilities(capabilities);
  const domains = ['master_data','inventory','procurement','finance','tax','fixed_assets','hr','sales','unknown'] as const;
  return Object.fromEntries(domains.map((domain) => {
    const rows = safe.filter((capability) => capability.domain === domain);
    return [domain, {
      count: rows.length,
      endpoints: rows.map((row) => ({ path: row.path, methods: row.methods, tags: row.tags })).slice(0, 200),
    }];
  }));
}

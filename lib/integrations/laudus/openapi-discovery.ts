export type LaudusCapability = {
  path: string;
  methods: string[];
  tags: string[];
  domain: 'master_data' | 'inventory' | 'procurement' | 'finance' | 'tax' | 'fixed_assets' | 'hr' | 'sales' | 'unknown';
  writeCapable: boolean;
};

type OpenApiOperation = { tags?: unknown };
type OpenApiPath = Record<string, OpenApiOperation>;
type OpenApiDocument = { paths?: Record<string, OpenApiPath> };

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

function classify(path: string, tags: string[]): LaudusCapability['domain'] {
  const haystack = (path + ' ' + tags.join(' ')).toLowerCase();
  if (/product|supplier|customer|cost.?center|warehouse/.test(haystack)) return 'master_data';
  if (/stock|inventory|warehouse|lot|serial/.test(haystack)) return 'inventory';
  if (/purchase|supplier.?invoice|waybill|receipt/.test(haystack)) return 'procurement';
  if (/accounting|journal|bank|payment|ledger|account/.test(haystack)) return 'finance';
  if (/dte|sii|tax|certificate/.test(haystack)) return 'tax';
  if (/fixed.?asset|depreciation/.test(haystack)) return 'fixed_assets';
  if (/employee|remuneration|absence|payroll/.test(haystack)) return 'hr';
  if (/sales|quote|sales.?order|sales.?invoice/.test(haystack)) return 'sales';
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
  return capabilities.map((capability) => ({
    ...capability,
    methods: capability.methods.filter((method) => method === 'get' || method === 'post'),
  }));
}

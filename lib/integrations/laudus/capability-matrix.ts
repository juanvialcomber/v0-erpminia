import { discoverLaudusCapabilities, type LaudusCapability } from './openapi-discovery';

const LAUDUS_ORIGIN = 'https://api.laudus.cl';
const SPEC_CANDIDATES = [
  '/swagger/v2/swagger.json',
  '/swagger/v1/swagger.json',
  '/swagger/swagger.json',
  '/openapi.json',
] as const;

type OpenApiDocument = {
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, { tags?: string[] }>>;
};

export type LaudusCapabilityRow = LaudusCapability & {
  motilModule: 'Finanzas' | 'Compras' | 'Bodega' | 'Activos' | 'Personas' | 'Comercial' | 'Tributario' | 'Por evaluar';
  value: string;
  status: 'connector_ready' | 'available' | 'evaluate';
  priority: number;
};

const READY_PATHS = new Set([
  '/production/products/list',
  '/purchases/suppliers/list',
  '/production/warehouses/list',
  '/purchases/costcenters/list',
]);

function moduleFor(capability: LaudusCapability): LaudusCapabilityRow['motilModule'] {
  switch (capability.domain) {
    case 'inventory': return 'Bodega';
    case 'procurement': return 'Compras';
    case 'finance': return 'Finanzas';
    case 'tax': return 'Tributario';
    case 'fixed_assets': return 'Activos';
    case 'hr': return 'Personas';
    case 'sales': return 'Comercial';
    case 'master_data': {
      const text = (capability.path + ' ' + capability.tags.join(' ')).toLowerCase();
      if (/product|warehouse/.test(text)) return 'Bodega';
      if (/supplier|cost.?center/.test(text)) return 'Compras';
      if (/account|bank/.test(text)) return 'Finanzas';
      return 'Por evaluar';
    }
    default: return 'Por evaluar';
  }
}

function priorityFor(capability: LaudusCapability): number {
  const text = (capability.path + ' ' + capability.tags.join(' ')).toLowerCase();
  if (/reconciliation\/bankstatementnotinjournal|reconciliation\/journalnotinbankstatement/.test(text)) return 100;
  if (/purchases\/invoices\/.+(payments|tracefrom|traceto)|purchases\/invoices\/ledger/.test(text)) return 98;
  if (/profitandloss|balancesheet|accounting\/ledger/.test(text)) return 96;
  if (/bankstatements\/list/.test(text)) return 95;
  if (/products\/.+kardex|products\/stock|stockbywarehouses|stocktransfers/.test(text)) return 94;
  if (/purchases\/orders\/.+(traceto|tracefrom|quantitydelivered)|purchases\/waybills\/.+(traceto|tracefrom|quantitydelivered)/.test(text)) return 92;
  if (/fixedassets\/depreciation|fixedassets\/list/.test(text)) return 90;
  if (/dte\/(status|pending)/.test(text)) return 88;
  if (/costcenters\/list|suppliers\/list|products\/list|warehouses\/list/.test(text)) return 80;
  if (/recipes\/list|inventories\/list/.test(text)) return 72;
  return 40;
}

function valueFor(capability: LaudusCapability): string {
  const text = (capability.path + ' ' + capability.tags.join(' ')).toLowerCase();
  if (/reconciliation\/bankstatementnotinjournal|reconciliation\/journalnotinbankstatement/.test(text)) return 'Detectar diferencias entre cartola bancaria y libro contable.';
  if (/fixed.?asset|depreciation/.test(text)) return 'Cruzar activo contable, depreciación y costo total con Activo 360.';
  if (/dte|sii|tax/.test(text)) return 'Estado documental y tributario trazable.';
  if (/bank|statement|cartola/.test(text)) return 'Conciliación bancaria y visibilidad de caja.';
  if (/profit.?and.?loss|balance|accounting|journal|ledger|account/.test(text)) return 'Control contable, resultados, variaciones y trazabilidad financiera.';
  if (/supplier.?invoice|purchase|receipt|waybill/.test(text)) return 'Conciliar compra, recepción, factura y cuenta por pagar.';
  if (/supplier/.test(text)) return 'Proveedor 360, concentración y desempeño de compras.';
  if (/stock|inventory/.test(text)) return 'Comparar stock ERP, stock MOTIL y conteo físico.';
  if (/warehouse/.test(text)) return 'Unificar bodegas y ubicación del inventario.';
  if (/product/.test(text)) return 'Maestro de productos, costos y trazabilidad de repuestos.';
  if (/cost.?center/.test(text)) return 'Imputación y análisis por centro de costo.';
  if (/employee|payroll|remuneration/.test(text)) return 'Costos de personas y trazabilidad laboral.';
  if (/sales|quote|order|customer|invoice/.test(text)) return 'Trazabilidad comercial desde cotización a cobro.';
  return 'Dato disponible para evaluar su aporte operacional.';
}

async function readJson(url: string): Promise<OpenApiDocument | null> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) return null;
  return await response.json() as OpenApiDocument;
}

async function discoverSpecUrlFromHtml(): Promise<string | null> {
  const response = await fetch(LAUDUS_ORIGIN + '/swagger/index.html', {
    cache: 'no-store',
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/url\s*:\s*["']([^"']+\.json)["']/i);
  if (!match?.[1]) return null;
  return new URL(match[1], LAUDUS_ORIGIN).toString();
}

export async function loadLaudusCapabilityMatrix() {
  let specUrl: string | null = null;
  let document: OpenApiDocument | null = null;

  for (const candidate of SPEC_CANDIDATES) {
    const url = LAUDUS_ORIGIN + candidate;
    document = await readJson(url).catch(() => null);
    if (document?.paths) {
      specUrl = url;
      break;
    }
  }

  if (!document?.paths) {
    const discovered = await discoverSpecUrlFromHtml().catch(() => null);
    if (discovered && new URL(discovered).hostname === 'api.laudus.cl') {
      document = await readJson(discovered).catch(() => null);
      if (document?.paths) specUrl = discovered;
    }
  }

  if (!document?.paths || !specUrl) {
    throw new Error('No fue posible leer la especificación pública de Laudus.');
  }

  const capabilities = discoverLaudusCapabilities(document);
  const rows: LaudusCapabilityRow[] = capabilities.map((capability) => ({
    ...capability,
    motilModule: moduleFor(capability),
    value: valueFor(capability),
    status: READY_PATHS.has(capability.path)
      ? 'connector_ready'
      : capability.domain === 'unknown'
        ? 'evaluate'
        : 'available',
    priority: priorityFor(capability),
  })).sort((a, b) => b.priority - a.priority || a.path.localeCompare(b.path));

  const byDomain = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.domain] = (acc[row.domain] || 0) + 1;
    return acc;
  }, {});
  const sourceGroups = rows.reduce<Record<string, number>>((acc, row) => {
    const group = row.path.split('/').filter(Boolean)[0] || 'otros';
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {});

  return {
    source: 'Laudus Swagger',
    specUrl,
    title: document.info?.title || 'Laudus API',
    version: document.info?.version || null,
    generatedAt: new Date().toISOString(),
    summary: {
      endpoints: rows.length,
      connectorReady: rows.filter((row) => row.status === 'connector_ready').length,
      writeCapable: rows.filter((row) => row.writeCapable).length,
      domains: Object.keys(byDomain).length,
    },
    byDomain,
    sourceGroups,
    rows,
  };
}

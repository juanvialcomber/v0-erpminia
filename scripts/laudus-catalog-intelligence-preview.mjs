const EXPECTED_BRANCH = 'feat/laudus-product-intelligence-20261023';

if (process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) {
  process.exit(0);
}

const baseUrl = String(process.env.LAUDUS_BASE_URL || 'https://api.laudus.cl').trim();
const userName = String(process.env.LAUDUS_USER_NAME || 'Motil').trim();
const password = String(process.env.LAUDUS_PASSWORD || '').trim();
const companyVATId = String(process.env.LAUDUS_COMPANY_VAT_ID || '84542800-K').trim();

if (!password) {
  throw new Error('LAUDUS_PASSWORD missing for preview catalog intelligence run.');
}

async function parse(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

const login = await fetch(baseUrl + '/security/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ userName, password, companyVATId }),
});
if (!login.ok) throw new Error('Laudus login failed with HTTP ' + login.status);
const loginPayload = await parse(login);
const token = typeof loginPayload === 'string' ? loginPayload : loginPayload?.token;
if (!token) throw new Error('Laudus token missing.');

function asciiUpper(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function prefixOf(value) {
  const m = asciiUpper(value).match(/^[A-Z]+/);
  return m?.[0] || 'SIN_PREFIJO';
}

const map = {
  REPUESTO: ['maintenance_supply', 'eligible'],
  FILTRO: ['maintenance_supply', 'eligible'],
  FERRETERIA: ['maintenance_supply', 'eligible'],
  ELECTRICO: ['maintenance_supply', 'eligible'],
  ACERO: ['maintenance_supply', 'eligible'],
  LUBRICANTE: ['maintenance_supply', 'eligible'],
  RODAMIENTO: ['maintenance_supply', 'eligible'],
  BOMBA: ['maintenance_supply', 'eligible'],
  NEUMATICO: ['maintenance_supply', 'eligible'],
  COMPO: ['maintenance_supply', 'eligible'],
  SONDAJE: ['maintenance_supply', 'eligible'],
  EPP: ['safety_supply', 'eligible'],
  REACTIVO: ['process_consumable', 'eligible'],
  ACTIVOFIJO: ['fixed_asset', 'exclude'],
  SERVI: ['service', 'exclude'],
  SERVICIO: ['service', 'exclude'],
  ESCRITORIO: ['general_supply', 'review'],
  VIVERES: ['general_supply', 'review'],
  OTROS: ['other', 'review'],
};

const categoryCounts = {};
const eligibilityCounts = {};
const prefixCounts = {};
const qualityFlagCounts = {};
const samplePrefixes = new Set(['SACOI','CEAR','FERIA','HI','EQUS','VENTA']);
const prefixSamples = {};
let totalRows = 0;
let offset = 0;
let pages = 0;
const limit = 500;

for (;;) {
  const res = await fetch(baseUrl + '/production/products/list', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    body: JSON.stringify({
      options: { offset, limit },
      fields: ['productId', 'SKU', 'description', 'unitOfMeasure'],
      filterBy: [],
      orderBy: [{ field: 'productId', direction: 'ASC' }],
    }),
  });

  if (!res.ok) throw new Error('Laudus product page failed at offset ' + offset + ' HTTP ' + res.status);
  const payload = await parse(res);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.results)
          ? payload.results
          : Array.isArray(payload?.rows)
            ? payload.rows
            : [];

  pages += 1;
  totalRows += rows.length;

  for (const row of rows) {
    const prefix = prefixOf(row?.SKU);
    const [category, eligibility] = map[prefix] || ['other', 'review'];
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    eligibilityCounts[eligibility] = (eligibilityCounts[eligibility] || 0) + 1;
    prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    if (samplePrefixes.has(prefix)) {
      prefixSamples[prefix] ||= [];
      if (prefixSamples[prefix].length < 8) prefixSamples[prefix].push({ SKU: row?.SKU ?? null, description: row?.description ?? null, unitOfMeasure: row?.unitOfMeasure ?? null });
    }

    const sku = String(row?.SKU ?? '').trim();
    const description = String(row?.description ?? '').trim();
    const unit = String(row?.unitOfMeasure ?? '').trim();
    const descriptionNorm = asciiUpper(description);
    if (!sku) qualityFlagCounts.missing_sku = (qualityFlagCounts.missing_sku || 0) + 1;
    if (!description) qualityFlagCounts.missing_description = (qualityFlagCounts.missing_description || 0) + 1;
    if (!unit || unit === '0') qualityFlagCounts.invalid_or_missing_unit = (qualityFlagCounts.invalid_or_missing_unit || 0) + 1;
    if (
      descriptionNorm.includes('GENERICO DE SERVICIO') ||
      descriptionNorm === 'DISPONIBLE' ||
      descriptionNorm.includes('CAMBIAR DESCRIPCION')
    ) qualityFlagCounts.generic_or_placeholder_description = (qualityFlagCounts.generic_or_placeholder_description || 0) + 1;
  }

  if (rows.length < limit) break;
  offset += rows.length;
  if (pages >= 40) throw new Error('Safety bound reached before Laudus catalog exhausted.');
}

const topPrefixes = Object.entries(prefixCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40)
  .map(([prefix, count]) => ({ prefix, count }));

console.log('LAUDUS_CATALOG_INTELLIGENCE ' + JSON.stringify({
  persisted: false,
  calls: pages + 1,
  pages,
  totalRows,
  categoryCounts,
  eligibilityCounts,
  qualityFlagCounts,
  topPrefixes,
  prefixSamples,
}));

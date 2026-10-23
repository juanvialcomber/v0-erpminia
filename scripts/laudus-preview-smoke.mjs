const baseUrl = process.env.LAUDUS_BASE_URL || 'https://api.laudus.cl';
const userName = process.env.LAUDUS_USER_NAME || 'Motil';
const companyVATId = process.env.LAUDUS_COMPANY_VAT_ID || '84542800-K';
const password = process.env.LAUDUS_PASSWORD;

if (!password) {
  console.error('[laudus-smoke] missing LAUDUS_PASSWORD');
  process.exit(1);
}

async function jsonFetch(path, init) {
  const response = await fetch(baseUrl + path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  if (!response.ok) {
    console.error('[laudus-smoke] request failed', path, response.status);
    process.exit(1);
  }
  return body;
}

const login = await jsonFetch('/security/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userName, password, companyVATId }),
});

const token = typeof login === 'string' ? login : login?.token;
if (!token) {
  console.error('[laudus-smoke] token missing');
  process.exit(1);
}

const targets = [
  ['products', '/production/products/list'],
  ['suppliers', '/purchases/suppliers/list'],
  ['warehouses', '/production/warehouses/list'],
  ['costCenters', '/purchases/costcenters/list'],
];

const summarize = (payload) => {
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === 'object') {
    for (const key of ['data', 'items', 'results', 'rows']) {
      if (Array.isArray(payload[key])) return payload[key].length;
    }
  }
  return null;
};

const results = {};
for (const [key, path] of targets) {
  const payload = await jsonFetch(path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ options: { offset: 0, limit: 5 } }),
  });
  results[key] = summarize(payload);
}

console.log('[laudus-smoke] success', JSON.stringify({
  authenticated: true,
  calls: 5,
  persisted: false,
  results,
}));

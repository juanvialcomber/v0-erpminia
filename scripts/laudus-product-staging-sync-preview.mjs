import { createClient } from '@supabase/supabase-js';

const EXPECTED_BRANCH = 'feat/laudus-product-intelligence-20261023';
if (process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) process.exit(0);

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const laudusBaseUrl = String(process.env.LAUDUS_BASE_URL || 'https://api.laudus.cl').trim();
const userName = String(process.env.LAUDUS_USER_NAME || 'Motil').trim();
const password = String(process.env.LAUDUS_PASSWORD || '').trim();
const companyVATId = String(process.env.LAUDUS_COMPANY_VAT_ID || '84542800-K').trim();

if (!supabaseUrl || !serviceRoleKey || !password) {
  throw new Error('Missing server-side integration configuration.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: orgs, error: orgError } = await supabase
  .from('organizations')
  .select('id,name')
  .limit(2);

if (orgError) throw new Error('Unable to resolve MOTIL organization.');
if (!orgs || orgs.length !== 1) {
  throw new Error('Expected exactly one MOTIL organization for bootstrap sync.');
}
const organizationId = orgs[0].id;

async function parse(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

const login = await fetch(laudusBaseUrl + '/security/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ userName, password, companyVATId }),
});
if (!login.ok) throw new Error('Laudus login failed with HTTP ' + login.status);
const loginPayload = await parse(login);
const token = typeof loginPayload === 'string' ? loginPayload : loginPayload?.token;
if (!token) throw new Error('Laudus token missing.');

let offset = 0;
const limit = 500;
let pages = 0;
let runId = null;
let totalRows = 0;
let inserted = 0;
let changed = 0;
let unchanged = 0;
let matched = 0;
let newCandidate = 0;
let conflict = 0;

for (;;) {
  const res = await fetch(laudusBaseUrl + '/production/products/list', {
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

  if (!res.ok) {
    throw new Error('Laudus product page failed at offset ' + offset + ' HTTP ' + res.status);
  }

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

  const finalize = rows.length < limit;
  const { data, error } = await supabase.rpc('motil_ingest_laudus_products', {
    p_organization_id: organizationId,
    p_rows: rows,
    p_run_id: runId,
    p_finalize: finalize,
  });

  if (error) {
    throw new Error('MOTIL staging ingest failed at offset ' + offset + ': ' + error.message);
  }

  runId = data?.run_id || runId;
  pages += 1;
  totalRows += rows.length;
  inserted += Number(data?.inserted || 0);
  changed += Number(data?.changed || 0);
  unchanged += Number(data?.unchanged || 0);
  matched += Number(data?.matched || 0);
  newCandidate += Number(data?.new_candidate || 0);
  conflict += Number(data?.conflict || 0);

  if (finalize) break;
  offset += rows.length;
  if (pages >= 40) throw new Error('Safety bound reached before Laudus product catalog exhausted.');
}

console.log('LAUDUS_PRODUCT_STAGING_SYNC ' + JSON.stringify({
  status: 'completed',
  persisted: true,
  target: 'integration_only',
  writeBackToLaudus: false,
  canonicalMutations: 0,
  calls: pages + 1,
  pages,
  totalRows,
  inserted,
  changed,
  unchanged,
  matched,
  newCandidate,
  conflict,
  runId,
}));

// retry after UUID reconciliation fix

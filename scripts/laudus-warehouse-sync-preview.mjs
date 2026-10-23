import { createClient } from '@supabase/supabase-js';

const EXPECTED_BRANCH = 'feat/laudus-product-intelligence-20261023';
if (process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) process.exit(0);

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const laudusBaseUrl = String(process.env.LAUDUS_BASE_URL || 'https://api.laudus.cl').trim();
const userName = String(process.env.LAUDUS_USER_NAME || 'Motil').trim();
const password = String(process.env.LAUDUS_PASSWORD || '').trim();
const companyVATId = String(process.env.LAUDUS_COMPANY_VAT_ID || '84542800-K').trim();

if (!supabaseUrl || !serviceRoleKey || !password) throw new Error('Missing server-side integration configuration.');

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: orgs, error: orgError } = await supabase.from('organizations').select('id').limit(2);
if (orgError || !orgs || orgs.length !== 1) throw new Error('Unable to resolve MOTIL organization.');

const login = await fetch(laudusBaseUrl + '/security/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ userName, password, companyVATId }),
});
if (!login.ok) throw new Error('Laudus login failed with HTTP ' + login.status);
const loginPayload = await login.json();
const token = typeof loginPayload === 'string' ? loginPayload : loginPayload?.token;
if (!token) throw new Error('Laudus token missing.');

const res = await fetch(laudusBaseUrl + '/production/warehouses/list', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
  },
  body: JSON.stringify({
    options: { offset: 0, limit: 500 },
    fields: ['warehouseId','name','address','county','city','state'],
    filterBy: [],
    orderBy: [{ field: 'warehouseId', direction: 'ASC' }],
  }),
});
if (!res.ok) throw new Error('Laudus warehouse read failed with HTTP ' + res.status);
const payload = await res.json();
const rows = Array.isArray(payload) ? payload : payload?.data || payload?.items || payload?.results || payload?.rows || [];

const { data, error } = await supabase.rpc('motil_ingest_laudus_warehouses', {
  p_organization_id: orgs[0].id,
  p_rows: rows,
});
if (error) throw new Error('MOTIL warehouse ingest failed: ' + error.message);

console.log('LAUDUS_WAREHOUSE_SYNC ' + JSON.stringify({
  status: 'completed',
  persisted: true,
  writeBackToLaudus: false,
  rowsRead: rows.length,
  ...data,
}));

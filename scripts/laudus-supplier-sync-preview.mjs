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

let offset = 0;
const limit = 500;
let pages = 0;
let totalRows = 0;
let matched = 0;
let newCandidate = 0;
let conflict = 0;

for (;;) {
  const res = await fetch(laudusBaseUrl + '/purchases/suppliers/list', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    body: JSON.stringify({
      options: { offset, limit },
      fields: ['supplierId','name','legalName','VATId','address','city','phone','email','term'],
      filterBy: [],
      orderBy: [{ field: 'supplierId', direction: 'ASC' }],
    }),
  });

  if (!res.ok) throw new Error('Laudus supplier list failed at offset ' + offset + ' HTTP ' + res.status);
  const payload = await res.json();
  const rows = Array.isArray(payload) ? payload : payload?.data || payload?.items || payload?.results || payload?.rows || [];

  const { data, error } = await supabase.rpc('motil_ingest_laudus_suppliers', {
    p_organization_id: orgs[0].id,
    p_rows: rows,
  });
  if (error) throw new Error('MOTIL supplier ingest failed at offset ' + offset + ': ' + error.message);

  pages += 1;
  totalRows += rows.length;
  matched += Number(data?.matched || 0);
  newCandidate += Number(data?.new_candidate || 0);
  conflict += Number(data?.conflict || 0);

  if (rows.length < limit) break;
  offset += rows.length;
  if (pages >= 20) throw new Error('Safety bound reached before Laudus suppliers exhausted.');
}

console.log('LAUDUS_SUPPLIER_SYNC ' + JSON.stringify({
  status:'completed',
  persisted:true,
  writeBackToLaudus:false,
  calls:pages + 1,
  pages,
  totalRows,
  matched,
  newCandidate,
  conflict,
}));

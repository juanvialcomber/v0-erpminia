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

const domains = [
  {
    entityType: 'purchase_order',
    endpoint: '/purchases/orders/list',
    idField: 'purchaseOrderId',
    fields: ['purchaseOrderId','orderNumber','number','docNumber','supplier','issuedDate','dueDate','warehouse','items','notes','status','currency','totals'],
  },
  {
    entityType: 'waybill',
    endpoint: '/purchases/waybills/list',
    idField: 'purchaseWaybillId',
    fields: ['purchaseWaybillId','docNumber','supplier','warehouse','issuedDate','items','notes'],
  },
  {
    entityType: 'purchase_invoice',
    endpoint: '/purchases/invoices/list',
    idField: 'purchaseInvoiceId',
    fields: ['purchaseInvoiceId','docNumber','supplier','issuedDate','dueDate','totals','items','warehouse','currency'],
  },
];

const result = {};

for (const domain of domains) {
  let offset = 0;
  const limit = 250;
  let pages = 0;
  let totalRows = 0;
  let totalLines = 0;

  for (;;) {
    const res = await fetch(laudusBaseUrl + domain.endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      body: JSON.stringify({
        options: { offset, limit },
        fields: domain.fields,
        filterBy: [{ field: 'issuedDate', operator: '>=', value: '2025-01-01T00:00:00' }],
        orderBy: [{ field: domain.idField, direction: 'ASC' }],
      }),
    });

    if (!res.ok) throw new Error(domain.entityType + ' list failed at offset ' + offset + ' HTTP ' + res.status);
    const payload = await res.json();
    const rows = Array.isArray(payload) ? payload : payload?.data || payload?.items || payload?.results || payload?.rows || [];

    const { data, error } = await supabase.rpc('motil_ingest_laudus_procurement_documents', {
      p_organization_id: orgs[0].id,
      p_entity_type: domain.entityType,
      p_rows: rows,
    });
    if (error) throw new Error(domain.entityType + ' ingest failed at offset ' + offset + ': ' + error.message);

    pages += 1;
    totalRows += rows.length;
    totalLines += Number(data?.lines || 0);

    if (rows.length < limit) break;
    offset += rows.length;
    if (pages >= 80) throw new Error('Safety bound reached before ' + domain.entityType + ' exhausted.');
  }

  result[domain.entityType] = { pages, totalRows, totalLines };
}

console.log('LAUDUS_PROCUREMENT_DOCUMENT_SYNC ' + JSON.stringify({
  status:'completed',
  persisted:true,
  writeBackToLaudus:false,
  fromDate:'2025-01-01',
  ...result,
}));

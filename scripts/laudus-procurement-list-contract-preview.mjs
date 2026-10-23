import { createClient } from '@supabase/supabase-js';

const EXPECTED_BRANCH='feat/laudus-product-intelligence-20261023';
if(process.env.VERCEL_GIT_COMMIT_REF!==EXPECTED_BRANCH) process.exit(0);

const base=String(process.env.LAUDUS_BASE_URL||'https://api.laudus.cl').trim();
const userName=String(process.env.LAUDUS_USER_NAME||'Motil').trim();
const password=String(process.env.LAUDUS_PASSWORD||'').trim();
const companyVATId=String(process.env.LAUDUS_COMPANY_VAT_ID||'84542800-K').trim();
const supabaseUrl=String(process.env.NEXT_PUBLIC_SUPABASE_URL||'').trim();
const serviceRoleKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
if(!password||!supabaseUrl||!serviceRoleKey) throw new Error('Missing server-side integration configuration');

const supabase=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:orgs,error:orgError}=await supabase.from('organizations').select('id').limit(2);
if(orgError||!orgs||orgs.length!==1) throw new Error('Unable to resolve MOTIL organization');
const organizationId=orgs[0].id;

const login=await fetch(base+'/security/login',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({userName,password,companyVATId})});
if(!login.ok) throw new Error('Laudus login HTTP '+login.status);
const lp=await login.json(); const token=typeof lp==='string'?lp:lp?.token; if(!token) throw new Error('Laudus token missing');

const domains=[
  {
    name:'waybill',
    path:'/purchases/waybills/list',
    id:'purchaseWaybillId',
    rpc:'motil_ingest_laudus_waybill_rows',
    fields:['purchaseWaybillId','docNumber','issuedDate','supplier.supplierId','supplier.name','supplier.legalName','supplier.VATId','warehouse.warehouseId','warehouse.name','items.itemId','items.product.productId','items.product.sku','items.product.description','items.product.unitOfMeasure','items.quantity'],
  },
  {
    name:'invoice',
    path:'/purchases/invoices/list',
    id:'purchaseInvoiceId',
    rpc:'motil_ingest_laudus_invoice_rows',
    fields:['purchaseInvoiceId','docNumber','issuedDate','dueDate','supplier.supplierId','supplier.name','supplier.legalName','supplier.VATId','warehouse.warehouseId','warehouse.name','items.itemId','items.product.productId','items.product.sku','items.product.description','items.product.unitOfMeasure','items.quantity','items.unitCost'],
  },
];

const result={};

for(const domain of domains){
  let offset=0;
  const limit=500;
  let pages=0;
  let totalRows=0;
  let totalLines=0;
  const ids=new Set();

  for(;;){
    const res=await fetch(base+domain.path,{
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json','Accept-Encoding':'gzip, deflate, br'},
      body:JSON.stringify({
        options:{offset,limit},
        fields:domain.fields,
        filterBy:[{field:'issuedDate',operator:'>=',value:'2025-01-01T00:00:00'}],
        orderBy:[{field:domain.id,direction:'ASC'}],
      }),
    });
    if(!res.ok){
      const body=await res.text();
      throw new Error(domain.name+' offset '+offset+' HTTP '+res.status+' '+body.slice(0,300));
    }

    const payload=await res.json();
    const rows=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.items)?payload.items:Array.isArray(payload?.rows)?payload.rows:[];
    for(const row of rows) if(row?.[domain.id]!=null) ids.add(String(row[domain.id]));

    const {data,error}=await supabase.rpc(domain.rpc,{
      p_organization_id:organizationId,
      p_rows:rows,
    });
    if(error) throw new Error(domain.name+' ingest offset '+offset+': '+error.message);

    pages+=1;
    totalRows+=rows.length;
    totalLines+=Number(data?.lines||0);

    if(rows.length<limit) break;
    offset+=rows.length;
    if(pages>=200) throw new Error('Safety bound reached before '+domain.name+' exhausted');
  }

  result[domain.name]={
    calls:pages,
    pages,
    rows:totalRows,
    distinctDocuments:ids.size,
    lines:totalLines,
  };
}

console.log('LAUDUS_WAYBILL_INVOICE_SYNC '+JSON.stringify({
  status:'completed',
  persisted:true,
  writeBackToLaudus:false,
  canonicalMutations:0,
  fromDate:'2025-01-01',
  authCalls:1,
  ...result,
}));

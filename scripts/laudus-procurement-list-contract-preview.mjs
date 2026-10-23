const EXPECTED_BRANCH='feat/laudus-product-intelligence-20261023';
if(process.env.VERCEL_GIT_COMMIT_REF!==EXPECTED_BRANCH) process.exit(0);

const base=String(process.env.LAUDUS_BASE_URL||'https://api.laudus.cl').trim();
const userName=String(process.env.LAUDUS_USER_NAME||'Motil').trim();
const password=String(process.env.LAUDUS_PASSWORD||'').trim();
const companyVATId=String(process.env.LAUDUS_COMPANY_VAT_ID||'84542800-K').trim();
if(!password) throw new Error('Missing Laudus password');

const login=await fetch(base+'/security/login',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({userName,password,companyVATId})});
if(!login.ok) throw new Error('Login '+login.status);
const lp=await login.json(); const token=typeof lp==='string'?lp:lp?.token; if(!token) throw new Error('No token');

const domains=[
  {name:'waybill',path:'/purchases/waybills/list',id:'purchaseWaybillId'},
  {name:'invoice',path:'/purchases/invoices/list',id:'purchaseInvoiceId'},
];

const out=[];
for(const domain of domains){
  const res=await fetch(base+domain.path,{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({options:{offset:0,limit:1},fields:[domain.id]}),
  });
  const text=await res.text(); let p=null; try{p=JSON.parse(text)}catch{}
  const rows=Array.isArray(p)?p:Array.isArray(p?.data)?p.data:Array.isArray(p?.items)?p.items:Array.isArray(p?.rows)?p.rows:[];
  out.push({
    domain:domain.name,
    path:domain.path,
    idField:domain.id,
    status:res.status,
    rowCount:rows.length,
    firstKeys:rows[0]?Object.keys(rows[0]):[],
    error:res.ok?null:(p?.message||String(text).slice(0,900)),
  });
}
console.log('LAUDUS_PROCUREMENT_LIST_CONTRACT '+JSON.stringify(out));

const EXPECTED_BRANCH='feat/laudus-product-intelligence-20261023';
if (process.env.VERCEL_GIT_COMMIT_REF!==EXPECTED_BRANCH) process.exit(0);

const base=String(process.env.LAUDUS_BASE_URL||'https://api.laudus.cl').trim();
const userName=String(process.env.LAUDUS_USER_NAME||'Motil').trim();
const password=String(process.env.LAUDUS_PASSWORD||'').trim();
const companyVATId=String(process.env.LAUDUS_COMPANY_VAT_ID||'84542800-K').trim();
if(!password) throw new Error('Missing Laudus password');

const login=await fetch(base+'/security/login',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({userName,password,companyVATId})});
if(!login.ok) throw new Error('Login HTTP '+login.status);
const lp=await login.json();
const token=typeof lp==='string'?lp:lp?.token;
if(!token) throw new Error('Token missing');

const candidates=[
  {name:'options_only',body:{options:{offset:0,limit:1}}},
  {name:'id_only',body:{options:{offset:0,limit:1},fields:['purchaseOrderId']}},
  {name:'id_and_date',body:{options:{offset:0,limit:1},fields:['purchaseOrderId','issuedDate']}},
];

const out=[];
for(const c of candidates){
  const res=await fetch(base+'/purchases/orders/list',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(c.body),
  });
  const text=await res.text();
  let parsed=null;
  try{parsed=JSON.parse(text);}catch{}
  const rows=Array.isArray(parsed)?parsed:Array.isArray(parsed?.data)?parsed.data:Array.isArray(parsed?.items)?parsed.items:Array.isArray(parsed?.rows)?parsed.rows:null;
  const first=rows?.[0];
  out.push({
    name:c.name,
    status:res.status,
    rowCount:Array.isArray(rows)?rows.length:null,
    firstKeys:first&&typeof first==='object'?Object.keys(first).slice(0,30):[],
    errorShape:!res.ok?(parsed&&typeof parsed==='object'?Object.keys(parsed).slice(0,20):String(text).slice(0,200)):null,
  });
  if(res.ok) break;
}
console.log('LAUDUS_ORDER_LIST_CONTRACT '+JSON.stringify(out));

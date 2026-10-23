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
const out=[];
for(const productId of [1,2,3]){
  for(const suffix of ['', '?dateTo=2026-10-23']){
    const res=await fetch(base+'/production/products/'+productId+'/stock'+suffix,{
      method:'GET',
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    });
    const text=await res.text(); let p=null; try{p=JSON.parse(text)}catch{}
    out.push({
      productId,
      suffix:suffix||'none',
      status:res.status,
      shape:Array.isArray(p)?'array':p===null?'null':typeof p,
      count:Array.isArray(p)?p.length:null,
      firstKeys:Array.isArray(p)&&p[0]&&typeof p[0]==='object'?Object.keys(p[0]):p&&typeof p==='object'?Object.keys(p):[],
      error:res.ok?null:(p?.message||String(text).slice(0,500)),
    });
    if(res.ok) break;
  }
}
console.log('LAUDUS_STOCK_CONTRACT '+JSON.stringify(out));

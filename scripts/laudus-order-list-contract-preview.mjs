const EXPECTED_BRANCH='feat/laudus-product-intelligence-20261023';
if(process.env.VERCEL_GIT_COMMIT_REF!==EXPECTED_BRANCH) process.exit(0);
const base=String(process.env.LAUDUS_BASE_URL||'https://api.laudus.cl').trim();
const userName=String(process.env.LAUDUS_USER_NAME||'Motil').trim();
const password=String(process.env.LAUDUS_PASSWORD||'').trim();
const companyVATId=String(process.env.LAUDUS_COMPANY_VAT_ID||'84542800-K').trim();
const login=await fetch(base+'/security/login',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({userName,password,companyVATId})});
if(!login.ok) throw new Error('Login '+login.status);
const lp=await login.json(); const token=typeof lp==='string'?lp:lp?.token; if(!token) throw new Error('No token');
const fields=['purchaseOrderId','issuedDate','dueDate','status','supplier.supplierId','supplier.name','supplier.legalName','supplier.VATId','warehouse.warehouseId','warehouse.name','items.itemId','items.product.productId','items.product.sku','items.product.description','items.product.unitOfMeasure','items.quantity','items.unitCost'];
const res=await fetch(base+'/purchases/orders/list',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({options:{offset:0,limit:2},fields})});
const text=await res.text(); let p=null; try{p=JSON.parse(text)}catch{}
const rows=Array.isArray(p)?p:Array.isArray(p?.data)?p.data:Array.isArray(p?.items)?p.items:Array.isArray(p?.rows)?p.rows:[];
const sample=rows.slice(0,2).map(r=>({keys:Object.keys(r),types:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Array.isArray(v)?'array':v===null?'null':typeof v]))}));
console.log('LAUDUS_ORDER_SHAPE '+JSON.stringify({status:res.status,rowCount:rows.length,sample,error:res.ok?null:(p?.message||String(text).slice(0,1000))}));

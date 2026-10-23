const EXPECTED_BRANCH='feat/laudus-product-intelligence-20261023';
if(process.env.VERCEL_GIT_COMMIT_REF!==EXPECTED_BRANCH) process.exit(0);
const base=String(process.env.LAUDUS_BASE_URL||'https://api.laudus.cl').trim();
const userName=String(process.env.LAUDUS_USER_NAME||'Motil').trim();
const password=String(process.env.LAUDUS_PASSWORD||'').trim();
const companyVATId=String(process.env.LAUDUS_COMPANY_VAT_ID||'84542800-K').trim();
const login=await fetch(base+'/security/login',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({userName,password,companyVATId})});
if(!login.ok) throw new Error('Login '+login.status);
const lp=await login.json(); const token=typeof lp==='string'?lp:lp?.token; if(!token) throw new Error('No token');
const sets=[
 ['purchaseOrderId','issuedDate'],
 ['purchaseOrderId','issuedDate','dueDate','status'],
 ['purchaseOrderId','issuedDate','dueDate','status','supplier.supplierId','supplier.name','supplier.legalName'],
 ['purchaseOrderId','issuedDate','dueDate','status','supplier.supplierId','supplier.name','supplier.legalName','warehouse.warehouseId','warehouse.name'],
 ['purchaseOrderId','issuedDate','dueDate','status','supplier.supplierId','supplier.name','supplier.legalName','warehouse.warehouseId','warehouse.name','items.product.productId','items.product.SKU','items.product.description','items.quantity','items.unitCost','items.unitOfMeasure']
];
const out=[];
for(const fields of sets){
 const res=await fetch(base+'/purchases/orders/list',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({options:{offset:0,limit:1},fields})});
 const text=await res.text(); let p=null; try{p=JSON.parse(text)}catch{}
 const rows=Array.isArray(p)?p:Array.isArray(p?.data)?p.data:Array.isArray(p?.items)?p.items:Array.isArray(p?.rows)?p.rows:[];
 out.push({fieldCount:fields.length,lastField:fields[fields.length-1],status:res.status,rowCount:rows.length,firstKeys:rows[0]?Object.keys(rows[0]).slice(0,30):[],error:res.ok?null:(p?.message||String(text).slice(0,220))});
}
console.log('LAUDUS_ORDER_FIELD_CONTRACT '+JSON.stringify(out));

// Official Swagger v2 SupplierDto; sample supplierId/name/modifiedAt validated live.
// Fields beyond the sample are schema-verified and await the bounded first load.
export const SUPPLIERS_CONTRACT=Object.freeze({domain:'suppliers',verified:true,version:'supplier-v2-20261023',path:'/purchases/suppliers/list',idField:'supplierId',modifiedField:'modifiedAt',maxPageSize:100,fields:['supplierId','VATId','name','legalName','email','phone','daysToExpiration','modifiedAt']});
export function santiagoTimestamp(date) {
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
// No scheduler or public route. Caller supplies authenticated server-side scope,
// a dedicated DB connection and encrypted key; the durable store gates all calls.
export async function loadSupplierEvidence(client) {
 return client.sync({domain:'suppliers',contract:SUPPLIERS_CONTRACT,maxPages:5,maxCalls:6,pageSize:100,cacheTtlMs:3600000});
}

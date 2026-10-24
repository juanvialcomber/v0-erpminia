/** Deterministic proposal only: never changes canonical supplier records. */
export function normalizedRut(value) {
 const rut=String(value||'').replace(/[.\s-]/g,'').toUpperCase();
 if(!/^\d{1,8}[0-9K]$/.test(rut)) return null;
 const body=rut.slice(0,-1);let sum=0,factor=2;
 for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*factor;factor=factor===7?2:factor+1;}
 const check=11-sum%11;const dv=check===11?'0':check===10?'K':String(check);
 return dv===rut.at(-1)?`${Number(body)}-${dv}`:null;
}
export function reconcileSuppliers(source,canonical) {
 const index=new Map();
 for(const row of canonical){const key=normalizedRut(row.tax_id);if(key)index.set(key,[...(index.get(key)||[]),row]);}
 const sourceCounts=new Map();for(const row of source){const key=normalizedRut(row.VATId);if(key)sourceCounts.set(key,(sourceCounts.get(key)||0)+1);}
 return source.map(row=>{
  const rut=normalizedRut(row.VATId);const matches=rut?index.get(rut)||[]:[];
  const status=!rut?'invalid_rut':sourceCounts.get(rut)>1?'duplicate_source':matches.length>1?'ambiguous':matches.length===1?'matched':'new';
  return {externalId:String(row.supplierId),rut,status,canonicalId:status==='matched'?matches[0].id:null,proposed:{legal_name:row.legalName||row.name||null,trade_name:row.name||null,email:row.email||null,phone:row.phone||null},source:'laudus'};
 });
}

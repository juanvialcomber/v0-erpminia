import {normalizedRut} from './supplier-reconciliation.mjs';
/** Read only local source evidence; caller enforces current module permissions. */
export async function readSupplierLaudusDetail(db,{organizationId,companyVATId,taxId}) {
 const rut=normalizedRut(taxId);
 if(!organizationId || !normalizedRut(companyVATId) || !rut)return {status:'needs_review',suppliers:[],orders:[]};
 const company=normalizedRut(companyVATId);const key=rut.replace('-','');
 const suppliers=await db.query(`select external_id,payload,observed_at from motil_laudus.evidence
 where organization_id=$1 and company_vat=$2 and domain='suppliers'
 and upper(regexp_replace(coalesce(payload->>'VATId',''),'[.[:space:]-]','','g'))=$3
 order by external_id limit 2`,[organizationId,company,key]);
 if(suppliers.rows.length!==1)return {status:suppliers.rows.length?'needs_review':'not_synced',suppliers:[],orders:[]};
 const orders=await db.query(`select external_id,payload,observed_at from motil_laudus.evidence
 where organization_id=$1 and company_vat=$2 and domain='purchases'
 and upper(regexp_replace(coalesce(payload#>>'{supplier,VATId}',payload->>'supplier.VATId',''),'[.[:space:]-]','','g'))=$3
 order by coalesce(payload->>'issuedDate','') desc,external_id limit 21`,[organizationId,company,key]);
 const s=suppliers.rows[0];
 return {status:'available',observedAt:s.observed_at,supplier:{externalId:s.external_id,legalName:s.payload.legalName||s.payload.name||null,email:s.payload.email||null,phone:s.payload.phone||null},
 orders:orders.rows.slice(0,20).map(o=>({externalId:o.external_id,issuedDate:o.payload.issuedDate||null,dueDate:o.payload.dueDate||null,sourceStatus:o.payload.status||null,voided:o.payload.nullDoc===true,observedAt:o.observed_at})),hasMoreOrders:orders.rows.length>20};
}

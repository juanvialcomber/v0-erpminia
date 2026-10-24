import {reconcileSuppliers} from './supplier-reconciliation.mjs';
/** Server-only read service. Caller must enforce fin_compras via existing RBAC.
 * Reads the local mirror only. Never calls Laudus or mutates canonical suppliers.
 * Duplicate detection covers the full company evidence set, not just this page.
 */
export async function readSupplierReview(db,{organizationId,companyVATId,offset=0,limit=50}) {
 if(!organizationId || !companyVATId || !Number.isInteger(offset) || offset<0 || !Number.isInteger(limit) || limit<1 || limit>100)throw new Error('INVALID_REVIEW_SCOPE');
 const company=String(companyVATId).replace(/\./g,'').trim().toUpperCase();
 const result=await db.query(`with source as (
  select external_id,payload,observed_at,
   upper(regexp_replace(coalesce(payload->>'VATId',''),'[.[:space:]-]','','g')) as rut_key
  from motil_laudus.evidence where organization_id=$1 and company_vat=$2 and domain='suppliers'
 ), page as (select * from source order by external_id limit $3 offset $4)
 select p.*, (select count(*)::int from source s where s.rut_key=p.rut_key) as source_count
 from page p order by external_id`,[organizationId,company,limit,offset]);
 const rows=result.rows;
 const keys=[...new Set(rows.map(r=>r.rut_key).filter(Boolean))];
 const canonical=keys.length ? (await db.query(`select id,tax_id,legal_name,trade_name,email,phone
 from public.canonical_suppliers_v1 where organization_id=$1
 and upper(regexp_replace(coalesce(tax_id,''),'[.[:space:]-]','','g'))=any($2::text[])
 order by id limit 301`,[organizationId,keys])).rows:[];
 // Fail closed on ambiguous overflow; do not resolve identities from a truncated set.
 if(canonical.length>300)throw new Error('CANONICAL_MATCH_LIMIT_EXCEEDED');
 const proposals=reconcileSuppliers(rows.map(r=>r.payload),canonical).map((proposal,i)=>{
  if(rows[i].source_count>1 && proposal.rut)return {...proposal,status:'duplicate_source',canonicalId:null};
  const existing=canonical.find(c=>String(c.id)===String(proposal.canonicalId));
  const differences=existing ? Object.entries(proposal.proposed).filter(([field,value])=>value!==null && String(existing[field]||'').trim()!==String(value).trim()).map(([field])=>field):[];
  return {...proposal,differences,observedAt:rows[i].observed_at};
 });
 return {proposals,offset,limit,returned:proposals.length,source:'laudus',mode:'review_only'};
}

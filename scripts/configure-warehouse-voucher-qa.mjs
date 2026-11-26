// Explicit QA-only provisioning. No account creation and no stock writes.
// JSON stdin: { organizationId, expiresAt, sourceReference, members:[{email,canApprove,canDeliver}] }
// MOTIL_VOUCHER_QA_DATABASE_URL must address a dedicated DB whose name contains "qa".
// Default dry-run; --apply writes ONLY nominal access/settings in that QA database.
import pg from 'pg';
import { uuid } from '../lib/bodega/voucher-input.mjs';
const chunks=[];
for await(const chunk of process.stdin) chunks.push(chunk);
const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
const target=process.env.MOTIL_VOUCHER_QA_DATABASE_URL;
if(!target) throw new Error('MOTIL_VOUCHER_QA_DATABASE_URL required');
const url=new URL(target);
if(url.hostname.includes('ttlptyheuqeotadtcbaw')||!url.pathname.toLowerCase().includes('qa')||!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('Dedicated QA database required; production is forbidden');
if(!uuid(input.organizationId)||!Array.isArray(input.members)||!input.members.length||input.members.length>20||!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=Date.now()||typeof input.sourceReference!=='string'||input.sourceReference.length<5) throw new Error('Invalid scope, expiry or evidence');
const db=new pg.Client({connectionString:target});
await db.connect();
try{
 await db.query('begin');
 const actual=await db.query('select current_database() name');
 if(!actual.rows[0].name.toLowerCase().includes('qa')) throw new Error('Connected database is not QA');
 const resolved=[];
 for(const member of input.members){
  const r=await db.query("select id,full_name from public.profiles where organization_id=$1 and lower(email)=lower($2) and status='active'",[input.organizationId,member.email]);
  if(r.rows.length!==1) throw new Error('Each member requires one active canonical profile; no changes applied');
  resolved.push({...member,...r.rows[0]});
 }
 if(new Set(resolved.map(p=>p.id)).size!==resolved.length) throw new Error('Duplicate member');
 const apply=process.argv.includes('--apply');
 if(apply){
  await db.query('insert into warehouse_voucher_settings(organization_id,enabled,deliveries_enabled,weekend_authorizations) values($1,true,false,false) on conflict(organization_id) do update set enabled=true,deliveries_enabled=false,weekend_authorizations=false',[input.organizationId]);
  for(const member of resolved) await db.query('insert into warehouse_voucher_access(organization_id,profile_id,can_request,can_approve,can_deliver,expires_at,source_reference) values($1,$2,true,$3,$4,$5,$6) on conflict(organization_id,profile_id) do update set can_request=true,can_approve=excluded.can_approve,can_deliver=excluded.can_deliver,expires_at=excluded.expires_at,source_reference=excluded.source_reference',[input.organizationId,member.id,member.canApprove===true,member.canDeliver===true,input.expiresAt,input.sourceReference]);
 }
 await db.query(apply?'commit':'rollback');
 console.log(JSON.stringify({mode:apply?'applied_qa':'dry_run',members:resolved.map(m=>({name:m.full_name,request:true,approve:m.canApprove===true,deliver:m.canDeliver===true})),stockWrites:0}));
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}

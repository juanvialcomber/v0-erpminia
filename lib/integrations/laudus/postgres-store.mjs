import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {LaudusError} from './readonly-sync.mjs';
export function sessionCipher(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new LaudusError('INVALID_ENCRYPTION_KEY');
  return {
    seal(value,scope) {const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(scope));const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');},
    open(value,scope) {try {const bytes=Buffer.from(value,'base64');const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(Buffer.from(scope));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());}catch {throw new LaudusError('SESSION_DECRYPTION_FAILED');}}
  };
}
/** One dedicated PostgreSQL connection per locked job; never use transaction pooling.
 * Budget reservations commit before network calls, including uncertain failures.
 * No credentials or tokens in event records. Schema is provisioned separately.
 */
export function createPostgresStore({pool,key}) {
 const cipher=sessionCipher(key);let db;let activeScope;let busy=false;
 function company(s) {return String(s.companyVATId).replace(/\./g,'').trim().toUpperCase();}
 function scopeKey(s) {return JSON.stringify([s.organizationId,company(s)]);}
 function check(s) {if(!db || scopeKey(s)!==activeScope)throw new LaudusError('STORE_SCOPE_NOT_LOCKED');}
 return {
  async withLock(s,fn) {
   if(busy)throw new LaudusError('STORE_ALREADY_BUSY');
   busy=true;
   let client;
   try {client=await pool.connect();}catch(error){busy=false;throw error;}const companyKey=company(s);let locked=false;
   try {
    const result=await client.query('select pg_try_advisory_lock(hashtextextended($1,0)) as locked',[`laudus:${companyKey}`]);
    locked=result.rows[0]?.locked===true;if(!locked)throw new LaudusError('SYNC_ALREADY_RUNNING');
    db=client;activeScope=scopeKey(s);return await fn();
   } finally {db=undefined;activeScope=undefined;try {if(locked)await client.query('select pg_advisory_unlock(hashtextextended($1,0))',[`laudus:${companyKey}`]);}catch(error){client.release(true);client=undefined;throw error;}finally{busy=false;if(client)client.release();}}
  },
  async reserveCall(s) {
   check(s);
   // Baseline must include all company consumers; validity is deliberately short.
   const r=await db.query(`update motil_laudus.monthly_usage set reserved=reserved+1
    where company_vat=$1 and month=$2 and organization_id=$3
    and baseline_valid_until>now() and baseline_calls+reserved<least($4,1800) returning reserved`,[company(s),s.month,s.organizationId,s.ceiling]);
   return r.rowCount===1;
  },
  async recordResult(s) {check(s);await db.query('insert into motil_laudus.call_results(organization_id,company_vat,path,status) values($1,$2,$3,$4)',[s.organizationId,company(s),s.path,s.status]);},
  async readSession(s) {check(s);const r=await db.query('select ciphertext from motil_laudus.sessions where organization_id=$1 and company_vat=$2',[s.organizationId,company(s)]);return r.rows[0]?cipher.open(r.rows[0].ciphertext,scopeKey(s)):undefined;},
  async writeSession(s) {check(s);await db.query(`insert into motil_laudus.sessions(organization_id,company_vat,ciphertext) values($1,$2,$3)
   on conflict(organization_id,company_vat) do update set ciphertext=excluded.ciphertext`,[s.organizationId,company(s),cipher.seal(s.session,scopeKey(s))]);},
  async clearSession(s) {check(s);await db.query('delete from motil_laudus.sessions where organization_id=$1 and company_vat=$2',[s.organizationId,company(s)]);},
  async readState(s) {check(s);const r=await db.query('select checkpoint from motil_laudus.sync_state where organization_id=$1 and company_vat=$2 and domain=$3',[s.organizationId,company(s),s.domain]);return r.rows[0]?.checkpoint;},
  async commitPage(s) {
   check(s);await db.query('begin');
   try {
    for(const row of s.rows)await db.query(`insert into motil_laudus.evidence(organization_id,company_vat,domain,external_id,module,payload) values($1,$2,$3,$4,$5,$6)
     on conflict(organization_id,company_vat,domain,external_id) do update set payload=excluded.payload,observed_at=now()`,[s.organizationId,company(s),s.domain,String(row[s.idField]),s.module,JSON.stringify(row)]);
    await db.query(`insert into motil_laudus.sync_state(organization_id,company_vat,domain,checkpoint) values($1,$2,$3,$4)
     on conflict(organization_id,company_vat,domain) do update set checkpoint=excluded.checkpoint`,[s.organizationId,company(s),s.domain,JSON.stringify(s.state)]);
    await db.query('commit');
   }catch(error){await db.query('rollback');throw error;}
  }
 };
}

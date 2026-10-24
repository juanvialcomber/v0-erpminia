// Manual server-side worker. No cron. Never load credentials from CLI arguments.
import {Pool} from 'pg';
import {createReadonlySync} from '../lib/integrations/laudus/readonly-sync.mjs';
import {createPostgresStore} from '../lib/integrations/laudus/postgres-store.mjs';
import {SUPPLIERS_CONTRACT} from '../lib/integrations/laudus/suppliers.mjs';
import {PURCHASES_CONTRACT} from '../lib/integrations/laudus/purchases.mjs';
const enabled=process.env.LAUDUS_SYNC_ENABLED==='true';
if(!enabled){console.log(JSON.stringify({status:'disabled',calls:0}));process.exit(0);}
const required=['LAUDUS_MIRROR_DATABASE_URL','LAUDUS_ORGANIZATION_ID','LAUDUS_COMPANY_VAT_ID','LAUDUS_USERNAME','LAUDUS_PASSWORD','LAUDUS_TOKEN_ENCRYPTION_KEY'];
if(required.some(k=>!process.env[k])){console.error('LAUDUS_CONFIGURATION_INCOMPLETE');process.exit(1);}
const key=Buffer.from(process.env.LAUDUS_TOKEN_ENCRYPTION_KEY,'base64');
const pool=new Pool({connectionString:process.env.LAUDUS_MIRROR_DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:10000});
try{
 const store=createPostgresStore({pool,key});
 const client=createReadonlySync({store,credentials:{organizationId:process.env.LAUDUS_ORGANIZATION_ID,companyVATId:process.env.LAUDUS_COMPANY_VAT_ID,userName:process.env.LAUDUS_USERNAME,password:process.env.LAUDUS_PASSWORD}});
 // Sequential domains share one session. Max six total network attempts for this
 // manual run; suppliers receive three, purchases receive only what remains.
 const suppliers=await client.sync({domain:'suppliers',contract:SUPPLIERS_CONTRACT,maxPages:3,maxCalls:3,cacheTtlMs:3600000});
 const remaining=6-suppliers.calls;
 const purchases=await client.sync({domain:'purchases',contract:PURCHASES_CONTRACT,maxPages:remaining,maxCalls:remaining,cacheTtlMs:3600000});
 console.log(JSON.stringify({status:'finished',suppliers,purchases,calls:suppliers.calls+purchases.calls}));
}catch(error){
 // Only known connector codes; never print pg errors or connection strings.
 const code=error?.name==='LaudusError'?error.message:'LAUDUS_SYNC_FAILED';
 console.error(JSON.stringify({status:'stopped',code}));process.exitCode=1;
}finally{key.fill(0);await pool.end();}

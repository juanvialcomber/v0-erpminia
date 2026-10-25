import {santiagoTimestamp} from './suppliers.mjs';
/** Server-only building block. No routes or schedulers activate this connector.
 * Store must durably and atomically reserve shared company/month usage, lock
 * company jobs, and commit pages + checkpoints together. Never use memory in production.
 */
export const DOMAIN_MODULES = Object.freeze({suppliers:'fin_compras', purchases:'fin_compras', inventory:'bodega_inventario', finance:'fin_finanzas'});
export class LaudusError extends Error { constructor(code) { super(code); this.name = 'LaudusError'; } }
export function createReadonlySync({credentials, store, fetchImpl = fetch, now = () => new Date(), monthlyCeiling = 1800}) {
  if (!credentials?.companyVATId || !credentials?.userName || !credentials?.password || !credentials?.organizationId) throw new LaudusError('CREDENTIALS_NOT_CONFIGURED');
  if (!Number.isInteger(monthlyCeiling) || monthlyCeiling < 1 || monthlyCeiling > 1800) throw new LaudusError('INVALID_MONTHLY_CEILING');
  if (store.readSession && !store.sessionIdentity) throw new LaudusError('SESSION_IDENTITY_NOT_CONFIGURED');
  const scope = {organizationId:credentials.organizationId, companyVATId:credentials.companyVATId,authIdentity:store.sessionIdentity ? store.sessionIdentity(credentials) : undefined};
  let session;
  let runCalls = 0;
  let runLimit = 0;
  async function call(path, body) {
    if (runCalls >= runLimit) throw new LaudusError('RUN_CALL_BUDGET_EXHAUSTED');
    // Exact host, no redirects, no caller-supplied URLs or arbitrary ERP writes.
    const month = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Santiago', year:'numeric', month:'2-digit'}).format(now());
    // Fail closed: unknown baseline or concurrent reservations must reject here.
    if (!await store.reserveCall({...scope, month, ceiling:monthlyCeiling})) throw new LaudusError('FREE_BUDGET_UNAVAILABLE');
    runCalls++;
    let response;
    try {
      response = await fetchImpl(`https://api.laudus.cl${path}`, {method:'POST', redirect:'error', signal:AbortSignal.timeout(20000), headers:{'Content-Type':'application/json', Accept:'application/json', ...(path === '/security/login' ? {} : {Authorization:`Bearer ${session.token}`})}, body:JSON.stringify(body)});
    } catch { throw new LaudusError('TRANSPORT_ERROR'); }
    await store.recordResult({...scope, path, status:response.status});
    if (!response.ok) { if (response.status === 401 || response.status === 403) { session = undefined; if (store.clearSession) await store.clearSession(scope); } throw new LaudusError(`HTTP_${response.status}`); }
    if (response.status === 204) return {rows:[], partial:false};
    let data;
    try { data = await response.json(); } catch { throw new LaudusError('INVALID_JSON'); }
    return {data, partial:response.status === 206};
  }
  async function login() {
    if (!session && store.readSession) session = await store.readSession(scope);
    if (session && Date.parse(session.expiration) > now().getTime() + 60000) return;
    const {data} = await call('/security/login', {companyVATId:credentials.companyVATId,userName:credentials.userName,password:credentials.password});
    if (!data?.token || !Number.isFinite(Date.parse(data.expiration)) || Date.parse(data.expiration) <= now().getTime() + 60000) throw new LaudusError('INVALID_SESSION');
    session = {token:data.token,expiration:data.expiration};
    if (store.writeSession) await store.writeSession({...scope,session});
  }
  return {async sync({domain, contract, maxPages = 5, maxCalls = 6, pageSize = 100, cacheTtlMs = 300000}) {
    if (!DOMAIN_MODULES[domain] || contract?.domain !== domain || contract?.verified !== true || !/^\/[a-zA-Z]+\/[a-zA-Z]+\/list$/.test(contract.path) || !contract.fields?.includes(contract.idField) || !contract.fields.includes(contract.modifiedField)) throw new LaudusError('UNVERIFIED_CONTRACT');
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new LaudusError('INVALID_PAGE_BUDGET');
    if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 21) throw new LaudusError('INVALID_CALL_BUDGET');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > (contract.maxPageSize || 100)) throw new LaudusError('INVALID_PAGE_SIZE');
    if (!Number.isInteger(cacheTtlMs) || cacheTtlMs < 300000 || cacheTtlMs > 86400000) throw new LaudusError('INVALID_CACHE_TTL');
    return store.withLock(scope, async () => {
      runCalls = 0;
      runLimit = maxCalls;
      const state = await store.readState({...scope, domain});
      if (state?.contractVersion && state.contractVersion !== contract.version) throw new LaudusError('CONTRACT_CHANGED');
      if (state?.completedAt && now().getTime() - Date.parse(state.completedAt) < cacheTtlMs) return {status:'cached',pages:0,calls:0};
      // Fixed upper bound plus stable ID cursor avoids shifting offsets. Equal
      // timestamps overlap deliberately; the store upserts by tenant/domain/id.
      const until = state?.until || santiagoTimestamp(now());
      const since = state?.since || state?.watermark;
      if (state?.offset) throw new LaudusError('LEGACY_OFFSET_REQUIRES_RECONCILIATION');
      let lastId = state?.lastId;
      await login();
      for (let page = 0; page < maxPages; page++) {
        if (runCalls >= runLimit) return {status:'paused',pages:page,calls:runCalls};
        const filterBy = [{field:contract.modifiedField,operator:'<=',value:until}];
        if (since) filterBy.push({field:contract.modifiedField,operator:'>=',value:since});
        if (lastId !== undefined) filterBy.push({field:contract.idField,operator:'>',value:lastId});
        const result = await call(contract.path, {options:{limit:pageSize,offset:0}, fields:contract.fields,filterBy,orderBy:[{field:contract.idField,direction:'ASC'}]});
        const rows = result.rows || result.data;
        if (!Array.isArray(rows) || rows.length > pageSize || rows.some(row => row?.[contract.idField] == null || !row[contract.modifiedField])) throw new LaudusError('INVALID_PAGE');
        if (result.partial && !rows.length) throw new LaudusError('EMPTY_PARTIAL_PAGE');
        const complete = !result.partial && rows.length < pageSize;
        for (const row of rows) {
          const id = Number(row[contract.idField]);
          if (!Number.isSafeInteger(id) || id < 0 || (lastId !== undefined && id <= lastId)) throw new LaudusError('UNSTABLE_PAGE_CURSOR');
          lastId = id;
        }
        await store.commitPage({...scope,domain,rows,idField:contract.idField,module:DOMAIN_MODULES[domain],state:complete ? {watermark:until,completedAt:now().toISOString(),contractVersion:contract.version} : {since,until,lastId,contractVersion:contract.version}});
        if (complete) return {status:'complete',pages:page+1,calls:runCalls};
      }
      return {status:'paused',pages:maxPages,calls:runCalls};
    });
  }};
}

/** Server-only building block. No routes or schedulers activate this connector.
 * Store must durably and atomically reserve shared company/month usage, lock
 * company jobs, and commit pages + checkpoints together. Never use memory in production.
 */
export const DOMAIN_MODULES = Object.freeze({suppliers:'fin_compras', purchases:'fin_compras', inventory:'bodega_inventario', finance:'fin_finanzas'});
export class LaudusError extends Error { constructor(code) { super(code); this.name = 'LaudusError'; } }
export function createReadonlySync({credentials, store, fetchImpl = fetch, now = () => new Date()}) {
  if (!credentials?.companyVATId || !credentials?.userName || !credentials?.password || !credentials?.organizationId) throw new LaudusError('CREDENTIALS_NOT_CONFIGURED');
  const scope = {organizationId:credentials.organizationId, companyVATId:credentials.companyVATId};
  let session;
  async function call(path, body) {
    // Exact host, no redirects, no caller-supplied URLs or arbitrary ERP writes.
    const month = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Santiago', year:'numeric', month:'2-digit'}).format(now());
    // Fail closed: unknown baseline or concurrent reservations must reject here.
    if (!await store.reserveCall({...scope, month, ceiling:2000})) throw new LaudusError('FREE_BUDGET_UNAVAILABLE');
    let response;
    try {
      response = await fetchImpl(`https://api.laudus.cl${path}`, {method:'POST', redirect:'error', signal:AbortSignal.timeout(20000), headers:{'Content-Type':'application/json', Accept:'application/json', ...(path === '/security/login' ? {} : {Authorization:`Bearer ${session.token}`})}, body:JSON.stringify(body)});
    } catch { throw new LaudusError('TRANSPORT_ERROR'); }
    await store.recordResult({...scope, path, status:response.status});
    if (!response.ok) { if (response.status === 401 || response.status === 403) session = undefined; throw new LaudusError(`HTTP_${response.status}`); }
    if (response.status === 204) return {rows:[], partial:false};
    let data;
    try { data = await response.json(); } catch { throw new LaudusError('INVALID_JSON'); }
    return {data, partial:response.status === 206};
  }
  async function login() {
    if (session && Date.parse(session.expiration) > now().getTime() + 60000) return;
    const {data} = await call('/security/login', {companyVATId:credentials.companyVATId,userName:credentials.userName,password:credentials.password});
    if (!data?.token || !Number.isFinite(Date.parse(data.expiration)) || Date.parse(data.expiration) <= now().getTime() + 60000) throw new LaudusError('INVALID_SESSION');
    session = {token:data.token,expiration:data.expiration};
  }
  return {async sync({domain, contract, maxPages = 5}) {
    if (!DOMAIN_MODULES[domain] || contract?.domain !== domain || contract?.verified !== true || !/^\/[a-zA-Z]+\/[a-zA-Z]+\/list$/.test(contract.path) || !contract.fields?.includes(contract.idField) || !contract.fields.includes(contract.modifiedField)) throw new LaudusError('UNVERIFIED_CONTRACT');
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new LaudusError('INVALID_PAGE_BUDGET');
    return store.withLock(scope, async () => {
      const state = await store.readState({...scope, domain});
      if (state?.contractVersion && state.contractVersion !== contract.version) throw new LaudusError('CONTRACT_CHANGED');
      if (state?.completedAt && now().getTime() - Date.parse(state.completedAt) < 300000) return {status:'cached',pages:0};
      // Fixed upper bound prevents a moving window between offset pages. Equal
      // timestamps overlap deliberately; the store upserts by tenant/domain/id.
      const until = state?.until || now().toISOString();
      const since = state?.since || state?.watermark;
      let offset = state?.offset || 0;
      await login();
      for (let page = 0; page < maxPages; page++) {
        const filterBy = [{field:contract.modifiedField,operator:'<=',value:until}];
        if (since) filterBy.push({field:contract.modifiedField,operator:'>=',value:since});
        const result = await call(contract.path, {options:{limit:100,offset}, fields:contract.fields,filterBy,orderBy:[{field:contract.modifiedField,direction:'ASC'},{field:contract.idField,direction:'ASC'}]});
        const rows = result.rows || result.data;
        if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => row?.[contract.idField] == null || !row[contract.modifiedField])) throw new LaudusError('INVALID_PAGE');
        if (result.partial && !rows.length) throw new LaudusError('EMPTY_PARTIAL_PAGE');
        const complete = !result.partial && rows.length < 100;
        offset += rows.length;
        await store.commitPage({...scope,domain,rows,idField:contract.idField,module:DOMAIN_MODULES[domain],state:complete ? {watermark:until,completedAt:now().toISOString(),contractVersion:contract.version} : {since,until,offset,contractVersion:contract.version}});
        if (complete) return {status:'complete',pages:page+1};
      }
      return {status:'paused',pages:maxPages};
    });
  }};
}

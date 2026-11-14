import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const raw = readFileSync(new URL('../../lib/api/module-access.ts', import.meta.url), 'utf8');
const source = stripTypeScriptTypes(raw.replace(/^import .*;\n/gm, '')).replace(/export /g, '');

// Execute the production functions; only the network and signed session boundary are mocked.
export function loadModuleAccess(client, session = { user: { id: 'user-a' }, role: 'worker' }) {
  return vm.runInNewContext(`(function () { ${source}\nreturn {getUserModuleAccess, getModuleAccessLevel, requireModuleAccess}; })()`, {
    getSupabaseServerClient: () => client,
    resolveAuthContext: async () => session,
    NextResponse: { json: (body, options) => ({ body, status: options.status }) },
  });
}

export function responseClient(response) {
  const calls = [];
  const client = { from(table) {
    const call = { table }; calls.push(call);
    const query = {
      select(columns) { call.columns = columns; return query; },
      eq(column, value) { call.filter = [column, value]; return query; },
      async maybeSingle() { return typeof response === 'function' ? response(call) : response; },
    };
    return query;
  } };
  return { client, calls };
}

export const plain = value => JSON.parse(JSON.stringify(value));

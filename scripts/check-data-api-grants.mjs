import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Conservative source check, not a SQL parser or a substitute for a reset test.
// Dynamic DDL and intentional private tables require an explicit reviewed decision.
export function missingContracts(sql) {
  const qualified = name => name.includes('.') ? name : `public.${name}`;
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  const grants = [...code.matchAll(/\bgrant\s+[^;]+?\s+on\s+(?:table\s+)?([^;]+?)\s+to\s+[^;]+/gi)].map(m => m[1]);
  return [...code.matchAll(/\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:[\w"]+\.)?[\w"]+)/gi)]
    .map(m => m[1].replaceAll('"',''))
    .map(qualified)
    .filter(name => !grants.some(targets => targets.split(',').some(t => qualified(t.trim().replaceAll('"','')) === name)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('../', import.meta.url);
  const exceptions = JSON.parse(await readFile(new URL('tests/db/grant-source-exceptions.json', root), 'utf8'));
  const failures = [];
  for (const file of (await readdir(new URL('supabase/migrations/', root))).filter(f => f.endsWith('.sql'))) {
    for (const table of missingContracts(await readFile(new URL(`supabase/migrations/${file}`, root), 'utf8'))) {
      const exception = exceptions[`${file}:${table}`];
      if (!exception) failures.push(`${file}: ${table} needs an explicit access contract`);
      else if (exception.sha256) {
        const bytes = await readFile(new URL(`supabase/migrations/${file}`, root));
        if (createHash('sha256').update(bytes).digest('hex') !== exception.sha256) failures.push(`${file}: historical HOLD changed; review ${table}`);
      } else {
        const grantSQL = await readFile(new URL(`supabase/migrations/${exception.grantMigration}`, root), 'utf8');
        if (!grantSQL.includes(table.split('.').at(-1)) || !/\bgrant\b/i.test(grantSQL)) failures.push(`${file}: stale exception for ${table}`);
      }
    }
  }
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('Data API source contracts checked; runtime replay remains required.');
}

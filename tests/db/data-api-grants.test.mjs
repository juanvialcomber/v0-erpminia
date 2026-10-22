import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../', import.meta.url);
const contract = JSON.parse(await readFile(new URL('data-api-contract.json', import.meta.url), 'utf8'));
const migration = name => readFile(new URL(`supabase/migrations/${name}`, root), 'utf8');
const tables = Object.entries(contract.tables);
const operations = ['select', 'insert', 'update', 'delete'];

async function database(legacyDefaults) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create table public.profiles(id uuid primary key);
    create table public.carpetas_arranque(id uuid primary key);
    create table public.carpeta_documentos(id uuid primary key, file_path text);
    create table public.motil_whatsapp_messages(id bigint primary key);
  `);
  if (legacyDefaults) await db.exec(`alter default privileges in schema public
    grant select, insert, update, delete on tables to anon, authenticated, service_role;`);
  for (const filename of new Set(tables.map(([, spec]) => spec.migration))) {
    await db.exec(await migration(filename));
  }
  return db;
}

for (const legacy of [false, true]) {
  test(`actual CREATE migrations and forward repair: ${legacy ? 'legacy' : 'opt-in'} defaults`, async () => {
    const db = await database(legacy);
    try {
      const before = await db.query(`select c.relname,c.relrowsecurity,
        (select count(*)::int from pg_policy p where p.polrelid=c.oid) policies
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=any($1::text[]) order by c.relname`, [tables.map(([t]) => t)]);
      assert.equal(before.rows.length, 12);
      assert.ok(before.rows.every(r => r.relrowsecurity && r.policies === 0));
      await db.exec(await migration(contract.forward));
      await db.exec(await migration(contract.forward)); // idempotent existing-project repair
      for (const [table, spec] of tables) {
        for (const operation of operations) {
          const { rows } = await db.query('select has_table_privilege($1,$2,$3) allowed', ['service_role', `public.${table}`, operation]);
          assert.equal(rows[0].allowed, legacy || spec.privileges.includes(operation), `${table}: service_role ${operation}`);
        }
        for (const role of ['anon', 'authenticated']) {
          await db.exec(`set role ${role}`);
          try {
            if (!legacy || ['user_push_subscriptions','legal_ai_document_reviews','motil_whatsapp_review_decisions'].includes(table)) {
              await assert.rejects(db.query(`select * from public.${table}`), e => e.code === '42501');
            } else {
              assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
            }
            await assert.rejects(db.query(`insert into public.${table} default values`), e => e.code === '42501');
          } finally { await db.exec('reset role'); }
        }
      }
      const after = await db.query(`select c.relname,c.relrowsecurity,
        (select count(*)::int from pg_policy p where p.polrelid=c.oid) policies
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=any($1::text[]) order by c.relname`, [tables.map(([t]) => t)]);
      assert.deepEqual(after.rows, before.rows);

      // Two organizations: the service role persists both through the existing server boundary;
      // direct authenticated clients can access neither, regardless of claimed organization.
      await db.exec('insert into public.motil_whatsapp_messages(id) values(1),(2)');
      await db.exec('set role service_role');
      for (const [index, org] of ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'].entries()) {
        await db.query(`insert into public.motil_whatsapp_review_decisions
          (organization_id,message_id,item_index,evidence_excerpt,decision,reviewer_id)
          values($1,$2,0,'synthetic QA','discarded',$1)`, [org,index+1]);
      }
      assert.equal((await db.query('select * from public.motil_whatsapp_review_decisions')).rows.length,2);
      if (!legacy) {
        await assert.rejects(db.query('delete from public.motil_whatsapp_review_decisions'), e => e.code==='42501');
        await assert.rejects(db.query("update public.motil_whatsapp_review_decisions set review_note='forbidden'"), e => e.code==='42501');
      }
      await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'00000000-0000-0000-0000-000000000001',organization_id:'00000000-0000-0000-0000-000000000001'})]);
      await assert.rejects(db.query('select * from public.motil_whatsapp_review_decisions'), e => e.code==='42501');
      await db.exec('reset role');
    } finally { await db.close(); }
  });
}

test('missing required grant is detected in an opt-in reset', async () => {
  const db = await database(false);
  try {
    await db.exec('revoke insert on public.motil_whatsapp_review_decisions from service_role; set role service_role');
    await assert.rejects(db.query('insert into public.motil_whatsapp_review_decisions default values'), e => e.code==='42501');
  } finally { await db.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { whatsappOperationalReviewEnabled } from '../lib/messages/whatsapp-operational-feature.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('production defaults off until explicitly activated after DB migration and authenticated QA',()=>{
  assert.equal(whatsappOperationalReviewEnabled({VERCEL_ENV:'production'}),false);
  assert.equal(whatsappOperationalReviewEnabled({VERCEL_ENV:'production',MOTIL_WHATSAPP_REVIEW_ENABLED:'false'}),false);
  assert.equal(whatsappOperationalReviewEnabled({VERCEL_ENV:'production',MOTIL_WHATSAPP_REVIEW_ENABLED:'TRUE'}),false);
  assert.equal(whatsappOperationalReviewEnabled({VERCEL_ENV:'production',MOTIL_WHATSAPP_REVIEW_ENABLED:'true'}),true);
  assert.equal(whatsappOperationalReviewEnabled({VERCEL_ENV:'preview'}),true);
  assert.equal(whatsappOperationalReviewEnabled({VERCEL_ENV:'development'}),false);
  assert.equal(whatsappOperationalReviewEnabled({}),false);
});

test('production admin preserves original WhatsApp UI while feature is disabled',()=>{
  const admin=source('app/dashboard/admin/whatsapp/page.tsx');
  const existingApi=source('app/api/admin/whatsapp/route.ts');
  assert.match(existingApi,/whatsappReviewEnabled: whatsappOperationalReviewEnabled\(\)/);
  assert.match(admin,/setWhatsappReviewEnabled\(Boolean\(j\.whatsappReviewEnabled\)\)/);
  assert.match(admin,/whatsappReviewEnabled \? <WhatsappTriageInbox/);
  assert.match(admin,/whatsappReviewEnabled \? <WhatsappOperationalLog/);
  assert.match(admin,/!whatsappReviewEnabled \? \(r\.findings\|\|\[\]\)\.map/);
});

test('new endpoints refuse access and writes when review feature is disabled',()=>{
  for(const path of [
    'app/api/admin/whatsapp/findings/route.ts',
    'app/api/admin/whatsapp/triage/route.ts',
    'app/api/admin/whatsapp/triage/message/route.ts',
    'app/api/admin/whatsapp/operational-log/route.ts',
  ]){
    const api=source(path);
    assert.match(api,/whatsappOperationalReviewEnabled\(\)/,path);
    assert.match(api,/503/,path);
    if(/findings\/route|operational-log\/route/.test(path)){
      assert.equal((api.match(/whatsappOperationalReviewEnabled\(\)/g)||[]).length,2,
        path+' must gate both GET and POST');
    }
  }
});

test('live daily report keeps the original domain vocabulary until enabled',()=>{
  const cron=source('app/api/cron/whatsapp-daily/route.ts');
  assert.match(cron,/enrichedClassification = whatsappOperationalReviewEnabled\(\)/);
  assert.match(cron,/content: enrichedClassification \?/);
  assert.match(cron,/domain: maintenance\|hse\|production\|procurement\|people\|other/);
  assert.match(cron,/domain: plant_operations\|plant_intervention\|plant_process\|dispatch\|machine_maintenance\|hse\|other/);
  assert.match(cron,/['"]maintenance['"],['"]hse['"],['"]production['"],['"]procurement['"],['"]people['"],['"]other['"]/);
  assert.match(cron,/reported_state: enrichedClassification/);
});

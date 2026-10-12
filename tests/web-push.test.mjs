import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createECDH } from 'node:crypto';
import webpush from 'web-push';

const source = readFileSync(new URL('../lib/notifications/web-push.ts', import.meta.url), 'utf8');
const moduleSource = stripTypeScriptTypes(source).replace("from 'web-push'", "from '" + import.meta.resolve('web-push') + "'");
const { getWebPushConfigError, sendWebPush } = await import('data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64'));
const generate = () => { const e = createECDH('prime256v1'); e.generateKeys(); const privateKey = e.getPrivateKey(); const padded = Buffer.concat([Buffer.alloc(32), privateKey]).subarray(-32); return { pub: e.getPublicKey().toString('base64url'), priv: padded.toString('base64url') }; };

test('VAPID rejects missing and mismatched credentials', () => {
 const a=generate(), b=generate();
 const env={WEB_PUSH_VAPID_PUBLIC_KEY:a.pub, WEB_PUSH_VAPID_PRIVATE_KEY:a.priv, WEB_PUSH_VAPID_SUBJECT:'mailto:push@example.com'};
 assert.equal(getWebPushConfigError(env),null);
 assert.equal(getWebPushConfigError({}),'missing_config');
 assert.equal(getWebPushConfigError({...env, WEB_PUSH_VAPID_PRIVATE_KEY:b.priv}),'key_pair_mismatch');
});

test('web-push transport preserves payload, TTL, errors and expiry semantics', async () => {
 const a=generate(); const old=webpush.sendNotification; const saved={...process.env};
 const sub={endpoint:'https://push.example.com/device',keys:{p256dh:a.pub,auth:'AAAAAAAAAAAAAAAAAAAAAA'}};
 const payload={title:'MOTIL',body:'Test',url:'/dashboard'};
 try {
   process.env.WEB_PUSH_VAPID_PUBLIC_KEY=a.pub; process.env.WEB_PUSH_VAPID_PRIVATE_KEY=a.priv; process.env.WEB_PUSH_VAPID_SUBJECT='mailto:push@example.com';
   webpush.sendNotification=async (input,body,options)=>{assert.deepEqual(input,sub);assert.deepEqual(JSON.parse(body),payload);assert.equal(options.TTL,300);assert.equal(options.vapidDetails.publicKey,a.pub);return {statusCode:201};};
   assert.deepEqual(await sendWebPush(sub,payload),{status:201,ok:true,expired:false});
   webpush.sendNotification=async()=>{throw {statusCode:410};};
   assert.deepEqual(await sendWebPush(sub,payload),{status:410,ok:false,expired:true});
   webpush.sendNotification=async()=>{throw {statusCode:403};};
   assert.deepEqual(await sendWebPush(sub,payload),{status:403,ok:false,expired:false});
 } finally {webpush.sendNotification=old;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});

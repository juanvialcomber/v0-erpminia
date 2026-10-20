import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 projectWhatsappActivity,groupPermittedForMode,whatsappSourceArea,
} from '../lib/messages/whatsapp-operational-projection.mjs';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const plant={id:'p',chat_id:'plant@g.us',display_name:'Planta Patagua',enabled:true};
const mine={id:'m',chat_id:'mine@g.us',display_name:'Grupo 2',enabled:true};
const dispatch={id:'d',chat_id:'dispatch@g.us',display_name:'Programación Despacho Concentrado CMLP',enabled:true};
const disabled={id:'off',chat_id:'120363427917216825@g.us',display_name:'Mantenimiento MOTIL la patagua',enabled:false};
const message=(id,group_id,sender_chat_id,body,occurred_at,message_type='textMessage')=>({
 id,group_id,sender_chat_id,body,occurred_at,received_at:occurred_at,message_type,
});
const media=(id,message_id,group_id,mime_type='video/mp4')=>({
 id,message_id,group_id,mime_type,download_status:'stored',
});
const base='2026-10-15T10:45:53Z';

test('scope is group-authorized, excludes former maintenance even if its name is reused',()=>{
 assert.equal(groupPermittedForMode(disabled,'overview'),false);
 assert.equal(groupPermittedForMode({...disabled,enabled:true},'overview'),false);
 assert.equal(groupPermittedForMode(mine,'plant'),false);
 assert.equal(groupPermittedForMode(dispatch,'dispatch'),true);
 assert.equal(groupPermittedForMode(mine,'maintenance'),true);
 assert.equal(whatsappSourceArea('Grupo 2'),'mine');
});

test('links exact-caption MP4 and same-sender unique nearby videos as work evidence',()=>{
 const messages=[
   message(45,'p','same','Limpieza y revisión de mallas\nRevisión de vigas del harnero\n\nPENDIENTE:\n-cambio de aceite',base,'videoMessage'),
   message(43,'p','same',null,'2026-10-15T10:45:54Z','videoMessage'),
   message(44,'p','another',null,'2026-10-15T10:45:54Z','videoMessage'),
 ];
 const feed=projectWhatsappActivity({groups:[plant],messages,attachments:[
   media('file-45',45,'p'),media('file-43',43,'p'),media('file-44',44,'p'),
 ],mode:'plant'});
 assert.ok(feed.updates.length>=2,'pending and reported blocks kept distinct');
 const ids=feed.updates[0].sourceEvidence.map(x=>x.id);
 assert.ok(ids.includes('file-45'),'direct attachment retained');
 assert.ok(ids.includes('file-43'),'unique close message associated with author and time');
 assert.ok(!ids.includes('file-44'),'never infer a relation from a different author');
 assert.equal(feed.unassignedVideos.length,1);
 assert.ok(feed.updates.some(x=>x.reportedState==='pending'));
 assert.equal(feed.latestReportedAt,base);
});

test('ambiguous multiple captions keep videos visible but unassigned',()=>{
 const messages=[
   message(1,'p','same','Limpieza de harnero','2026-10-16T10:12:00Z'),
   message(2,'p','same','Cambio de apex en molino 5x6','2026-10-16T10:14:00Z'),
   message(3,'p','same',null,'2026-10-16T10:15:00Z','videoMessage'),
 ];
 const feed=projectWhatsappActivity({groups:[plant],messages,
   attachments:[media('file-3',3,'p')],mode:'plant'});
 assert.equal(feed.unassignedVideos.length,1);
 assert.equal(feed.unassignedVideos[0].association,'sin_asociacion_inequivoca');
 assert.ok(feed.updates.every(x=>x.sourceEvidence.length===0));
});

test('route mine reports into production overview and drilling view without inventing OT',()=>{
 const messages=[
   message(8,'m','a','Sondaje MDS 141, revisión de avance','2026-10-17T12:00:00Z'),
   message(9,'d','b','Coordinación de despacho de concentrado','2026-10-17T11:00:00Z'),
   message(10,'off','c','Orden de trabajo terminada','2026-10-17T12:10:00Z'),
 ];
 const input={groups:[plant,mine,dispatch,disabled],messages,attachments:[]};
 const overview=projectWhatsappActivity({...input,mode:'overview'});
 assert.ok(overview.updates.some(x=>x.sourceMessageId===8));
 assert.ok(overview.updates.some(x=>x.sourceMessageId===9));
 assert.ok(overview.updates.every(x=>x.sourceMessageId!==10));
 assert.equal(projectWhatsappActivity({...input,mode:'dispatch'}).updates.length,1);
 assert.ok(projectWhatsappActivity({...input,mode:'drilling'}).updates.length>=1);
 assert.equal(projectWhatsappActivity({...input,mode:'maintenance'}).updates.length,0);
 assert.equal(projectWhatsappActivity({...input,mode:'plant'}).updates.length,0);
});


test('mine, drilling and maintenance feeds split mixed Grupo 2 content by destination',()=>{
 const messages=[
   message(21,'m','a','Viajes a planta:\n3 viajes programados','2026-10-19T10:00:00Z'),
   message(22,'m','a','Sondaje MDS 141\nMetros: 12.3','2026-10-19T10:01:00Z'),
   message(23,'m','a','Reporte de equipos\nScoop 1000 fuera de servicio','2026-10-19T10:02:00Z'),
 ];
 const input={groups:[mine],messages,attachments:[]};
 const mineFeed=projectWhatsappActivity({...input,mode:'mine'});
 const drillingFeed=projectWhatsappActivity({...input,mode:'drilling'});
 const maintenanceFeed=projectWhatsappActivity({...input,mode:'maintenance'});
 assert.ok(mineFeed.updates.some(x=>x.destinationId==='mine_movements'));
 assert.ok(mineFeed.updates.every(x=>x.destinationId!=='mine_drilling'&&x.destinationId!=='mine_equipment'));
 assert.ok(drillingFeed.updates.length>0&&drillingFeed.updates.every(x=>x.destinationId==='mine_drilling'));
 assert.ok(maintenanceFeed.updates.length>0&&maintenanceFeed.updates.every(x=>x.destinationId==='mine_equipment'));
});

test('protected read routes preserve tenant boundaries and do not modify certified sources',()=>{
 const api=file('app/api/produccion/whatsapp-activity/route.ts');
 const evidence=file('app/api/produccion/whatsapp-evidence/[id]/route.ts');
 const ui=file('components/production/whatsapp-operational-updates.tsx');
 assert.match(api,/requireModuleAccess/);
 assert.match(api,/\.eq\('organization_id',ctx\.organizationId\)/);
 assert.match(api,/\.eq\('enabled',true\)/);
 assert.match(api,/\.limit\(240\)/);
 assert.match(evidence,/requireModuleAccess/);
 assert.match(evidence,/groupPermittedForMode\(group,mode\)/);
 assert.match(evidence,/createSignedUrl\(file\.storage_path,120\)/);
 assert.match(ui,/Última actualización informada \(WhatsApp\)/);
 assert.match(ui,/Video(s)? del turno sin actividad específica confirmada/);
 for(const src of [api,evidence]) {
   assert.doesNotMatch(src,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
   assert.doesNotMatch(src,/maintenance_work_orders|production_plant_shifts/);
 }
});


test('operational sections surface the matching WhatsApp feed before domain detail',()=>{
 const overview=file('components/dashboard/produccion-dashboard.tsx');
 const mineUi=file('components/production/mine-sector-intelligence.tsx');
 const drillingUi=file('app/dashboard/produccion/sondaje/page.tsx');
 const transportUi=file('components/production/mineral-transport-dashboard.tsx');
 const plantUi=file('components/production/plant-metallurgy-dashboard.tsx');
 const maintenanceUi=file('components/dashboard/maintenance-home.tsx');
 const feedUi=file('components/production/whatsapp-operational-updates.tsx');
 assert.match(overview,/<WhatsappOperationalUpdates mode="overview"\/>/);
 assert.match(mineUi,/<WhatsappOperationalUpdates mode="mine"\/>/);
 assert.match(drillingUi,/<WhatsappOperationalUpdates mode="drilling"\/>/);
 assert.match(transportUi,/<WhatsappOperationalUpdates mode="dispatch"\/>/);
 assert.match(plantUi,/<WhatsappOperationalUpdates mode="plant"\/>/);
 assert.match(maintenanceUi,/<WhatsappOperationalUpdates mode="maintenance"\/>/);
 assert.ok(mineUi.indexOf('<WhatsappOperationalUpdates mode="mine"/>')<
   mineUi.indexOf('Minas alerta'));
 assert.ok(transportUi.indexOf('<WhatsappOperationalUpdates mode="dispatch"/>')<
   transportUi.indexOf('Toneladas transportadas'));
 assert.ok(plantUi.indexOf('<WhatsappOperationalUpdates mode="plant"/>')<
   plantUi.indexOf('<PlantSourceCutoff/>'));
 assert.match(feedUi,/refreshInterval:60000/);
 assert.match(feedUi,/refreshWhenHidden:false/);
 assert.match(feedUi,/revalidateOnReconnect:true/);
 assert.match(feedUi,/actualización automática cada 60 s/);
});

test('long shift reports preserve content and label videos as evidence of the whole report',()=>{
 const detail='Limpieza y revisión de mallas. '+('Inspección operacional con observaciones. '.repeat(15));
 const feed=projectWhatsappActivity({groups:[plant],messages:[
   message(81,'p','same',detail+'\n\nPENDIENTE:\n-cambio de correas','2026-10-16T10:00:00Z','videoMessage'),
 ],attachments:[media('file-81',81,'p')],mode:'plant'});
 assert.ok(feed.updates.length>=2);
 assert.ok(feed.updates[0].text.length>350,'long source content not truncated to a teaser');
 assert.equal(feed.updates[0].sourceEvidence[0].association,'adjunto_de_reporte');
});

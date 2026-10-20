import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  suggestWhatsappSection,prepareWhatsappTriage,repetitionKey,extractWhatsappSections,declaredMineHint,
} from '../lib/messages/whatsapp-triage.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const msg=(id,body,group_name='Planta Patagua',message_type='textMessage')=>({
  id,body,group_name,message_type,occurred_at:'2026-10-15T20:45:00Z',
});
test('plant work is never routed to machinery OT',()=>{
  const examples=[
    ['Cambio de aceite a chancador 330 L XP220','plant_equipment'],
    ['Cambio de guarderas en cinta N°3','plant_equipment'],
    ['Cambio de correas de Harnero Furlan','plant_equipment'],
    ['Calibración de pH y phímetros','plant_process'],
    ['Leyes de concentrado y cancha','plant_process'],
    ['Limpieza general de instalaciones','plant_daily'],
    ['PENDIENTE: retirar maxisaco del área','plant_pending'],
  ];
  for(const [text,expected] of examples){
    const result=suggestWhatsappSection({groupName:'Planta Patagua',text});
    assert.equal(result.id,expected,text);
    assert.notEqual(result.id,'machine_maintenance');
  }
});
test('dispatch coordination is not recorded as a completed shipment',()=>{
  const result=suggestWhatsappSection({
    groupName:'Programación Despacho Concentrado CMLP',
    text:'Falta definir horario de carguío, la recepción es de 08:00 a 15:30.',
  });
  assert.equal(result.id,'dispatch');
  assert.equal(result.reportedState,'unclear');
  assert.equal(result.scope,'dispatch');
});
test('OT software problems from a separate support group are NOT plant equipment work',()=>{
  const result=suggestWhatsappSection({
    groupName:'Mantenimiento MOTIL la patagua',
    text:'Genere OT para programar la semana y a Joaquin solo le aparecía una.',
  });
  assert.equal(result.id,'app_support');
  assert.equal(result.scope,'');
});
test('media without readable text is not classified by group alone',()=>{
  const result=suggestWhatsappSection({
    groupName:'Planta Patagua',
    messageType:'imageMessage',
    text:'',
  });
  assert.equal(result.id,'awaiting_media');
  assert.equal(result.needsMediaReview,true);
  assert.equal(result.confidence,'low');
});
test('reporting a change is not proof that a job is physically completed',()=>{
  const unknown=suggestWhatsappSection({
    groupName:'Planta Patagua',text:'Cambio de aceite a chancador',
  });
  assert.equal(unknown.reportedState,'unclear');
  const pending=suggestWhatsappSection({
    groupName:'Planta Patagua',text:'PENDIENTE retirar maxisaco',
  });
  assert.equal(pending.reportedState,'pending');
  assert.equal(pending.safetyReview,true);
  const declared=suggestWhatsappSection({
    groupName:'Planta Patagua',text:'Se realiza limpieza de chutes',
  });
  assert.equal(declared.reportedState,'reported_done');
});
test('mixed shift bulletin never assigns one global pending/completed state',()=>{
  const summary=suggestWhatsappSection({
    groupName:'Planta Patagua',
    messageType:'videoMessage',
    text:'Limpieza y revisión de mallas\nRevisión de vigas del harnero\nPENDIENTE:\n-cambio de aceite\n-RETIRAR MAXISACO DEL ÁREA',
  });
  assert.equal(summary.id,'plant_pending');
  assert.equal(summary.reportedState,'unclear');
  assert.equal(summary.mixedClaim,true);
  const support=suggestWhatsappSection({
    groupName:'Mantenimiento MOTIL la patagua',
    text:'Nos juntamos cuando llegue a casa?',
  });
  assert.equal(support.id,'needs_routing');
});

test('the source-only routing finds text missing from AI findings, without inventing coverage',()=>{
  const sources=[
    msg(45,'Se realizó limpieza de mallas. PENDIENTE: retirar maxisaco','Planta Patagua','videoMessage'),
    msg(569,'Falta horario de carguío','Programación Despacho Concentrado CMLP'),
    msg(1661,'Cambio aceite Chancador'),
    msg(1658,'Se calibran phímetros','Planta Patagua','imageMessage'),
    msg(1650,'Adición de cal 480 g por minuto','Planta Patagua','imageMessage'),
    msg(1999,'','Planta Patagua','imageMessage'),
  ];
  const findings=[
    {detail:'Cambio de aceite a chancador',source_ids:[1661],review_status:'pending'},
    {detail:'Coordinación logística para despacho',source_ids:[569],review_status:'pending'},
  ];
  const triage=prepareWhatsappTriage(sources,findings);
  assert.equal(triage.totals.messages,6);
  assert.equal(triage.totals.withText,5);
  assert.equal(triage.totals.referencedMessages,2);
  assert.equal(triage.totals.uncoveredText,3);
  assert.equal(triage.totals.mediaWithoutText,1);
  assert.equal(triage.totals.mediaToReview,4);
  assert.equal(triage.findings[1].suggestion.id,'dispatch');
  assert.equal(triage.items.find(x=>x.id===1650).coverage,'not_extracted');
  assert.equal(triage.items.find(x=>x.id===1999).coverage,'media_pending');
  assert.equal(triage.items.find(x=>x.id===1999).proposal.id,'awaiting_media');
});
test('repeated plant works become review flags, never automatic merged facts',()=>{
  assert.equal(repetitionKey('Cambio de guardería cinta N°3'),'cinta3_guardera');
  assert.equal(repetitionKey('Cambio de guarderas a cinta N°3 de chancado terciario'),'cinta3_guardera');
  assert.equal(repetitionKey('Cambio de correas harnero Furlan'),'harnero_correas');
  const triage=prepareWhatsappTriage([
    msg(1661,'Cambio de guardería de cinta N°3'),
    msg(2081,'Cambio de guarderas a cinta N°3'),
  ],[
    {detail:'Cambio de guardería de cinta N°3',source_ids:[1661]},
    {detail:'Cambio de guarderas a cinta N°3 de chancado terciario',source_ids:[2081]},
  ]);
  assert.equal(triage.findings.length,2);
  assert.deepEqual(triage.possibleRepeats,[{key:'cinta3_guardera',indices:[0,1]}]);
});
test('tenant-scoped read-only API and UI never mutate operational modules',()=>{
  const api=read('app/api/admin/whatsapp/triage/route.ts');
  const ui=read('components/whatsapp/whatsapp-triage-inbox.tsx');
  const admin=read('app/dashboard/admin/whatsapp/page.tsx');
  assert.match(api,/requireAdmin\(request\)/);
  assert.match(api,/\.eq\('organization_id',auth\.organizationId\)/);
  assert.match(api,/motil_whatsapp_daily_evidence/);
  assert.match(api,/p_organization_id:auth\.organizationId/);
  assert.match(api,/p_limit:251/);
  assert.doesNotMatch(api,/\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(api,/maintenance_work_orders|production_metallurgy_results|production_plant_shifts/);
  assert.match(ui,/>Todos<\/option>/);
  assert.match(ui,/Sin actividad extraída/);
  assert.match(ui,/Sin coincidencias\./);
  assert.match(ui,/La clasificación es provisional/i);
  assert.match(admin,/WhatsappTriageInbox/);
});


test('Grupo 2 source is routed by mine/site evidence instead of its generic name',()=>{
  const reports=[
    ['Buen día. Información mina Don Jaime. REPORTE DE EQUIPOS. Scoop 6 - F/S. - SONDAS. DIAMEC 230 Metros: 18.00.','Mina Don Jaime','mine_combined'],
    ['Buen día Información desde mina Peumo. Viajes a planta Miércoles: 8 viajes. Estado de los equipos: Scoop 5 operativo. Sondaje Diamec 232.','Mina Peumo','mine_combined'],
    ['BUEN DÍA, INFORMACIÓN DESDE SAN PEDRO. Trabajos realizados ayer. REPORTE DE EQUIPOS: Scoop 1030 operativo.','San Pedro','mine_combined'],
    ['Buenos días, equipos de Raíz del Cobre. Scoop 1000 Operativo con novedades pérdida aceite motor.','Raíz del Cobre','mine_equipment'],
  ];
  for(const [text,site,id] of reports){
    assert.equal(declaredMineHint(text),site,text);
    assert.equal(suggestWhatsappSection({groupName:'Grupo 2',text}).id,id,text);
  }
  const message=suggestWhatsappSection({
    groupName:'Grupo 2',text:'Leyes de planta en imagen',messageType:'imageMessage',
  });
  assert.equal(message.id,'mine_quality');
  assert.equal(message.needsMediaReview,true);
  assert.equal(suggestWhatsappSection({groupName:'Grupo 2',text:'Buenos días'}).id,'needs_routing');
});

test('composite mine reports preserve exact line spans and independent destination routing',()=>{
  const source=[
    'Buen día. Información mina Peumo.',
    '',
    'Viajes a planta',
    'Miércoles 14/10: 8 viajes.',
    '',
    'Estado de los equipos:',
    'Scoop ST1030 N7: operativo con fuga refrigerante.',
    '',
    'Sondaje:',
    'DIAMEC 232/2008: DP25-12',
    'Turno A: 27 mts.',
    'Turno B: 18 mts.',
    'Horómetro: 260155.',
    '',
    'Viajes para hoy:',
    'C-53 Sur: 4 viajes.',
  ].join('\n');
  const sections=extractWhatsappSections({groupName:'Grupo 2',text:source});
  const ids=new Set(sections.map(s=>s.proposal.id));
  assert.equal(sections.length>=4,true,JSON.stringify(sections));
  assert.equal(ids.has('mine_movements'),true);
  assert.equal(ids.has('mine_equipment'),true);
  assert.equal(ids.has('mine_drilling'),true);
  assert.ok(sections.every(section=>section.lineStart>=1&&section.lineEnd<=16));
  assert.ok(sections.every(section=>section.siteHint==='Mina Peumo'));
  assert.equal(sections.some(section=>section.needsNumericalReview),true);
  assert.equal(sections.find(section=>/Viajes para hoy/.test(section.title)).reportedState,'planned');
  const prepared=prepareWhatsappTriage([msg(5365,source,'Grupo 2')],[]);
  assert.equal(prepared.totals.multiSection,1);
  assert.equal(prepared.bySection.some(section=>section.id==='mine_drilling'),true);
  assert.equal(prepared.bySection.some(section=>section.id==='mine_equipment'),true);
  assert.equal(prepared.bySection.some(section=>section.id==='mine_movements'),true);
  assert.equal(prepared.items[0].sections[0].lineStart,1);
});

test('mixed plant shift bulletin separates completed text from PENDIENTE source lines',()=>{
  const source=[
    'Limpieza y revisión de mallas',
    'Revisión de vigas del harnero',
    'Limpieza imanes',
    'Revisión nivel de aceite',
    '',
    'PENDIENTE:',
    '-cambio de aceite',
    '-cambio correas de Harnero',
    '-RETIRAR MAXISACO DEL ÁREA',
  ].join('\n');
  const sections=extractWhatsappSections({groupName:'Planta Patagua',text:source});
  assert.equal(sections.length,2);
  assert.equal(sections[0].reportedState,'unclear');
  assert.equal(sections[1].reportedState,'pending');
  assert.equal(sections[1].proposal.id,'plant_pending');
  assert.equal(sections[0].lineStart,1);
  assert.equal(sections[1].lineStart,6);
});

test('full-message detail is tenant/date/group authorization scoped and lazy',()=>{
  const api=read('app/api/admin/whatsapp/triage/message/route.ts');
  const ui=read('components/whatsapp/whatsapp-triage-inbox.tsx');
  assert.match(api,/requireAdmin\(request\)/);
  assert.match(api,/\.eq\('organization_id',auth\.organizationId\)/);
  assert.match(api,/localDay\(new Date\(message\.occurred_at\)\)!==date/);
  assert.match(api,/\.eq\('enabled',true\)/);
  assert.match(api,/\.eq\('message_id',message\.id\)/);
  assert.match(api,/body\.slice\(0,20000\)/);
  assert.match(ui,/Ver mensaje completo y adjuntos/);
  assert.match(ui,/Líneas \{block\.lineStart\}/);
  assert.match(ui,/block\.lineStart/);
  assert.match(ui,/needsNumericalReview/);
  assert.doesNotMatch(api,/\.update\(|\.upsert\(|\.insert\(|\.delete\(/);
});

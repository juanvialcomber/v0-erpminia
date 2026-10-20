// Advisory classification for MOTIL's WhatsApp triage inbox.
// Source text is untrusted. Every suggestion requires human confirmation before
// it can be written to the independent operational log or a canonical module.
const clean = value => typeof value === 'string' ? value.trim().slice(0,3000) : '';
const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const section = (id,label,reason,scope,category,confidence='medium') =>
  ({ id,label,reason,scope,category,confidence });

export function suggestWhatsappSection({groupName='',text='',messageType=''} = {}) {
  const name=norm(groupName),body=norm(text),type=norm(messageType);
  const media=/image|video|audio|document|sticker/.test(type);
  if (!body) {
    return {
      ...section('awaiting_media','Multimedia pendiente de lectura',
        'El archivo no tiene texto utilizable; no se presupone su contenido.',
        '', '', 'low'),
      reportedState:'unclear', needsMediaReview:media, safetyReview:false, mixedClaim:false,
    };
  }
  const inPlant=/\bplanta\b|\bconcentradora\b/.test(name);
  const inMineSource=/^grupo\s*2$/.test(name) ||
    /\bmina\s+(?:peumo|don jaime)\b|\bdesde san pedro\b|\braiz del cobre\b/.test(body);
  const inDispatch=/despacho|concentrado|cmlp|logistica/.test(name);
  const inMaintenance=/mantenimiento motil/.test(name);
  // Named groups only indicate a tentative source context, not a verified
  // department or permission to update that module.
  let target;
  if ((inMaintenance && /(\bot\b|ordenes? de trabajo|program|no (?:aparece|deja|sale)|problema|error)/.test(body)) ||
    /\b(login|pantalla|aplicacion|software)\b/.test(body) && /(?:error|problema|falla)/.test(body)) {
    target=section('app_support','Aplicación MOTIL / soporte',
      'El texto comunica una incidencia o mejora del software; no es una OT física.',
      '', '', 'medium');
  } else if (inDispatch || /(?:horario de carguio|recepcion|despacho de concentrado|conductores y representante)/.test(body)) {
    target=section('dispatch','Despachos y logística',
      'Coordinación logística informada; no acredita un despacho ejecutado.',
      'dispatch','dispatch_coordination');
  } else if (inMineSource && /(?:leyes? de planta|leyes? de cancha|leyes? del dia|cortador de cinta)/.test(body)) {
    target=section('mine_quality','Muestras y leyes informadas',
      'La referencia a análisis o leyes exige leer el informe o imagen original.',
      '', '', 'low');
  } else if (inMineSource && /(?:reporte de equipos|estado de los equipos)/.test(body) &&
    /(?:sondaj|sondas?|viajes a planta|trabajos (?:realizados|para hoy))/.test(body)) {
    target=section('mine_combined','Reporte mixto de mina',
      'Contiene bloques de distintas áreas. Revisar cada bloque por separado, sin aplicar automáticamente.',
      '', '', 'medium');
  } else if (inMineSource && /(?:sonda|sondaje|perfor|diamec|onram|mds\s*141)/.test(body)) {
    target=section('mine_drilling','Perforación y sondajes',
      'Metros y observaciones de perforación informados, aún sin conciliación por turno o pozo.',
      '', '', 'medium');
  } else if (inMineSource && /(?:reporte de equipos|estado de los equipos|operativ|fuera de servicio|f\/s|horometro)/.test(body)) {
    target=section('mine_equipment','Estado de equipos de mina',
      'Disponibilidad o falla reportada; no actualiza el estado del activo ni genera OT.',
      '', '', 'medium');
  } else if (inMineSource && /(?:viajes a planta|viajes para hoy|camion a botadero)/.test(body)) {
    target=section('mine_movements','Movimientos informados',
      'Viajes históricos o programados, no movimientos certificados de inventario.',
      '', '', 'medium');
  } else if (inMineSource && /(?:trabajos realizados|trabajos para hoy|tronadura|acuñadura|perforacion|marina)/.test(body)) {
    target=section('mine_activities','Actividades de mina',
      'Reporte de avance de labores. Diferenciar fecha de envío y fecha del trabajo.',
      '', '', 'medium');
  } else if (inMineSource) {
    target=section('needs_routing','Reporte de mina por clasificar',
      'El grupo contiene varias faenas; el texto no determina el área con certeza.',
      '', '', 'low');
  } else if (inPlant && /(?:maxisaco|obstruccion|riesgo|derrame|incidente)/.test(body) &&
    /(?:pendiente|retirar|riesgo|incidente)/.test(body)) {
    target=section('plant_pending','Pendientes de planta',
      'Pendiente operacional que puede requerir evaluación de seguridad; no se abre incidente HSE.',
      'plant','pending_task');
  } else if (inPlant && /(?:\bph\b|phimetro|calibr|leyes?\b|dosific|adicion de cal|recuperacion|humedad|ley de concentrado|leyes de planta|tonelaje|phmetro)/.test(body)) {
    target=section('plant_process','Proceso y metalurgia',
      'Medición o intervención en proceso reportada, todavía no dato de laboratorio certificado.',
      'plant','process_reading');
  } else if (inPlant && /(?:chancad|harnero|correa|polin|cinta|guardera|bomba|filtro|chute|molino|aceite|phim|rodillo|instalacion electrica|torneria|sinf.in)/.test(body)) {
    target=section('plant_equipment','Intervenciones de planta',
      'Trabajo relacionado con instalaciones de proceso, no con OT de maquinaria.',
      'plant','plant_intervention');
  } else if (inPlant) {
    target=section('plant_daily','Operación diaria de planta',
      'Novedad de turno recibida desde planta; su subcategoría requiere revisión.',
      'plant','other','low');
  } else {
    target=section('needs_routing','Pendiente de clasificar',
      'No es seguro inferir un módulo a partir de esta fuente.', '', '', 'low');
  }
  // Never infer physical completion from a noun phrase such as "cambio aceite".
  const mentionsPending=/\bpendiente(?:s)?\b/.test(body);
  const explicitWork=/\b(?:se (?:realiza|realizo|ajusta|cambia|reparo|retiro)|quedo (?:terminado|completado))\b/.test(body);
  const pendingBlock=body.search(/(?:^|\n)\s*pendiente(?:s)?\s*:/m);
  const mixedClaim=mentionsPending && (explicitWork ||
    (pendingBlock > 12 && body.slice(0,pendingBlock).trim().length > 12));
  const reportedState=mixedClaim ? 'unclear'
    :mentionsPending ? 'pending'
    :explicitWork ? 'reported_done'
    :'unclear';
  const safetyReview=target.id==='plant_pending' &&
    /(?:maxisaco|obstruccion|riesgo|derrame|incidente)/.test(body);
  return {
    ...target,
    reportedState,
    needsMediaReview:media,
    safetyReview,
    mixedClaim,
  };
}


// Site text is a routing hint only, never a canonical mine, plant or asset FK.
export function declaredMineHint(value) {
  const body=norm(value);
  if (/\bmina\s+don jaime\b/.test(body)) return 'Mina Don Jaime';
  if (/\bmina\s+peumo\b/.test(body)) return 'Mina Peumo';
  if (/\bdesde\s+san pedro\b/.test(body)) return 'San Pedro';
  if (/\braiz del cobre\b/.test(body)) return 'Raíz del Cobre';
  return null;
}

// Split composite reports into human-reviewable blocks with 1-based original
// line numbers. A block is NOT an independently verified operation.
export function extractWhatsappSections({groupName='',text=''}={}) {
  const raw=typeof text==='string'?text.slice(0,16000).replace(/\r/g,''):'';
  const lines=raw.split('\n');
  if(!raw.trim())return [];
  const heading=/^\s*[-*]?\s*(?:reporte de equipos|estado de los equipos|camionetas|equipos|sondas|sondaje|compresores y generadores|generadores|viajes a planta|viajes para hoy|trabajos realizados(?: ayer)?|trabajos para hoy|pendientes?|preventiva|recuperativa|diamec\s+\d[\w./-]*|onram(?:\s+\S+){0,2}|mds\s+\d+)\b/i;
  const starts=[0];
  for(let i=1;i<lines.length;i++){
    if(!heading.test(norm(lines[i])))continue;
    if(i-starts[starts.length-1] < 2) continue;
    starts.push(i);
  }
  starts.push(lines.length);
  const siteHint=declaredMineHint(raw);
  const chunks=[];
  for(let i=0;i<starts.length-1 && chunks.length<20;i++){
    const begin=starts[i],end=starts[i+1];
    const body=lines.slice(begin,end).join('\n').trim();
    if(!body || body.length<4)continue;
    const title=clean(lines[begin]).slice(0,100) ||
      (i===0 ? 'Introducción y contexto' : 'Bloque de novedades');
    const normTitle=norm(title);
    const globalMine=/^grupo\s*2$/i.test(clean(groupName))||Boolean(siteHint);
    let proposal;
    if (/viajes a planta|viajes para hoy/.test(normTitle)) {
      proposal=section('mine_movements','Movimientos informados',
        'Registro narrativo de viajes; confirmar fecha, origen y comprobantes.', '', '', 'medium');
    } else if (globalMine && /trabajos realizados|trabajos para hoy/.test(normTitle)) {
      proposal=section('mine_activities','Actividades de mina',
        'Actividades de mina narradas; no certifican ejecución física.', '', '', 'medium');
    } else if (/sondas?|sondaje|diamec|onram|mds\s/.test(normTitle)) {
      proposal=section('mine_drilling','Perforación y sondajes',
        'Lecturas y avance por sonda requieren identificar pozo, turno y unidad.', '', '', 'medium');
    } else if (globalMine && /reporte de equipos|estado de los equipos|camionetas|^[-*]?\s*equipos\b|generadores|compresores/.test(normTitle)) {
      proposal=section('mine_equipment','Estado de equipos de mina',
        'Disponibilidad y fallas son observaciones, nunca una OT o actualización de activo.', '', '', 'medium');
    } else if (/pendiente/.test(normTitle)) {
      proposal=section('plant_pending','Pendientes de planta',
        'Verificar las tareas abiertas, no resolverlas a partir de otras menciones.', 'plant','pending_task','medium');
    } else if (/preventiva|recuperativa/.test(normTitle)) {
      proposal=section('plant_equipment','Intervenciones de planta',
        'Clase de actividad de planta, no OT de máquinas.', 'plant','plant_intervention','medium');
    } else {
      proposal=suggestWhatsappSection({groupName,text:body});
    }
    const state=/trabajos para hoy|viajes para hoy/.test(normTitle)?'planned'
      :/trabajos realizados/.test(normTitle)?'reported_done'
      :/pendiente/.test(normTitle)?'pending'
      :proposal.reportedState||'unclear';
    const hourText=body.match(/hor[oó]metro\s*:\s*(\d{5,})\b/i);
    chunks.push({
      lineStart:begin+1,lineEnd:end,title,siteHint,
      excerpt:body.slice(0,350),proposal,reportedState:state,
      needsNumericalReview:Boolean(hourText),
      multipleContexts:chunks.length>0 || starts.length>2,
    });
  }
  return chunks;
}

export function repetitionKey(detail) {
  const text=norm(detail);
  if (/guarder/.test(text) && /cinta.{0,15}(?:n.?3|numero 3|3|terciario)/.test(text))
    return 'cinta3_guardera';
  if (/correa/.test(text) && /harnero|furlan/.test(text))
    return 'harnero_correas';
  if (/mallas/.test(text) && /harnero/.test(text))
    return 'harnero_mallas';
  return null;
}

export function prepareWhatsappTriage(messages, findings, options={}) {
  const limit=Number.isSafeInteger(options.limit)&&options.limit>0?Math.min(options.limit,250):250;
  const rows=Array.isArray(messages)?messages.slice(0,limit):[];
  const sourceRefs=new Map();
  const findingCards=Array.isArray(findings)?findings.slice(0,50):[];
  findingCards.forEach((finding,index)=>{
    const ids=Array.isArray(finding?.source_ids)?finding.source_ids:[];
    for(const id of ids) {
      if(!Number.isSafeInteger(id)||id<=0)continue;
      const indexes=sourceRefs.get(id)||[];
      indexes.push(index);
      sourceRefs.set(id,indexes);
    }
  });
  const items=rows.map(row=>{
    const body=clean(row.body);
    const proposal=suggestWhatsappSection({
      groupName:row.group_name,
      text:body,
      messageType:row.message_type,
    });
    const findingIndexes=sourceRefs.get(Number(row.id))||[];
    return {
      id:row.id,
      groupName:clean(row.group_name).slice(0,120),
      siteHint:declaredMineHint(body),
      sections:extractWhatsappSections({groupName:row.group_name,text:row.body}),
      messageType:clean(row.message_type).slice(0,50),
      occurredAt:row.occurred_at,
      excerpt:body.slice(0,1200),
      hasText:body.length>0,
      findingIndexes,
      coverage:!body?'media_pending':findingIndexes.length?'referenced':'not_extracted',
      proposal,
    };
  });
  const sourceById=new Map(items.map(m=>[Number(m.id),m]));
  const proposedFindings=findingCards.map((f,index)=>{
    const ids=Array.isArray(f?.source_ids)?f.source_ids.filter(id=>Number.isSafeInteger(id)&&id>0):[];
    const matches=ids.map(id=>sourceById.get(id)).filter(Boolean);
    const groups=[...new Set(matches.map(m=>m.groupName))];
    const basis=groups.length===1?groups[0]:'';
    const suggestion=suggestWhatsappSection({
      groupName:basis,
      text:clean(f?.detail),
      messageType:'textMessage',
    });
    return {
      index,detail:clean(f?.detail).slice(0,450),
      sourceIds:ids,groups,reviewStatus:f?.review_status||'pending',
      suggestion,sourceComplete:ids.length>0&&matches.length===ids.length,
    };
  });
  const repeatedGroups=new Map();
  proposedFindings.forEach(item=>{
    const key=repetitionKey(item.detail);
    if(!key)return;
    const indexes=repeatedGroups.get(key)||[];
    indexes.push(item.index);
    repeatedGroups.set(key,indexes);
  });
  const possibleRepeats=[...repeatedGroups.entries()]
    .filter(([,indexes])=>indexes.length>1)
    .map(([key,indexes])=>({key,indices:indexes}));
  const totals={
    messages:items.length,
    withText:items.filter(x=>x.hasText).length,
    referencedMessages:items.filter(x=>x.coverage==='referenced').length,
    uncoveredText:items.filter(x=>x.coverage==='not_extracted').length,
    mediaWithoutText:items.filter(x=>x.coverage==='media_pending').length,
    mediaToReview:items.filter(x=>x.proposal.needsMediaReview).length,
    multiSection:items.filter(x=>x.sections.length>1).length,
    findings:proposedFindings.length,
  };
  const bySection=Array.from(items.reduce((m,item)=>{
    // A mixed mine report legitimately belongs in multiple destination queues.
    // Count once per source message per destination, never as independent work
    // completed or as the number of equipment units mentioned.
    const proposed=new Map([[item.proposal.id,item.proposal]]);
    for(const block of item.sections)proposed.set(block.proposal.id,block.proposal);
    for(const [id,route] of proposed){
      let group=m.get(id);
      if(!group){group={id,label:route.label,total:0,uncovered:0};m.set(id,group)}
      group.total++;
      if(item.coverage==='not_extracted')group.uncovered++;
    }
    return m;
  },new Map()).values()).sort((a,b)=>b.total-a.total || a.id.localeCompare(b.id));
  return {totals,bySection,items,findings:proposedFindings,possibleRepeats};
}

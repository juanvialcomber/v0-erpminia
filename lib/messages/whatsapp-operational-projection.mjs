// Source-backed operational updates for read-only production panels.
// WhatsApp is evidence of reported work; it never certifies completion,
// produces an OT, or changes mineral/metal accounting.
import {suggestWhatsappSection, extractWhatsappSections} from './whatsapp-triage.mjs';

export const EXCLUDED_CHAT_ID = '120363427917216825@g.us';

const normalized = value => String(value||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function whatsappSourceArea(name) {
  const v=normalized(name);
  if(v==='planta patagua') return 'plant';
  if(v==='grupo 2') return 'mine';
  if(v.includes('despacho') && v.includes('concentrado')) return 'dispatch';
  return null;
}
export const validSourceMode = value =>
  ['overview','plant','mine','dispatch','drilling','maintenance'].includes(value);
export function groupPermittedForMode(group,mode='overview'){
  if(!group?.enabled || group.chat_id===EXCLUDED_CHAT_ID) return false;
  const area=whatsappSourceArea(group.display_name);
  return Boolean(area && (mode==='overview'||mode===area||
    ((mode==='drilling'||mode==='maintenance')&&area==='mine')));
}
const isoTime = value => {
  const t=Date.parse(String(value||''));
  return Number.isFinite(t)?t:NaN;
};
const isImage = mime => /^image\/(jpeg|png|webp)$/.test(mime||'');
const isVideo = mime => mime==='video/mp4';
const textOf = row => typeof row.body==='string'?row.body.trim():'';

const fileOut = (a,association) => ({
  id:a.id,mimeType:a.mime_type,association,
  label:isVideo(a.mime_type)?'Video original':'Foto original',
});

export function projectWhatsappActivity({groups=[],messages=[],attachments=[],mode='overview',limit=16}={}) {
  if(!validSourceMode(mode)) throw new Error('invalid_whatsapp_mode');
  const allowed=new Map(groups.filter(g=>groupPermittedForMode(g,mode))
    .map(g=>[g.id,g]));
  const sourceMessages=messages.filter(m=>allowed.has(m.group_id)
      && Number.isSafeInteger(Number(m.id)) && Number(m.id)>0 &&
      Number.isFinite(isoTime(m.occurred_at||m.received_at)))
    .sort((a,b)=>isoTime(b.occurred_at||b.received_at)-isoTime(a.occurred_at||a.received_at));
  const sourceIds=new Set(sourceMessages.map(m=>Number(m.id)));
  const media=attachments.filter(a=>sourceIds.has(Number(a.message_id))
    && allowed.has(a.group_id) && a.download_status==='stored'
    && (isImage(a.mime_type)||isVideo(a.mime_type)));
  const byMessage=new Map();
  for(const a of media){
    const key=Number(a.message_id);
    byMessage.set(key,[...(byMessage.get(key)||[]),a]);
  }
  const captions=sourceMessages.filter(m=>textOf(m).length>=5);
  const videoAttachments=media.filter(a=>isVideo(a.mime_type));
  const linkedVideos=new Map();
  const unassigned=[];
  for(const video of videoAttachments){
    const carrier=sourceMessages.find(m=>Number(m.id)===Number(video.message_id));
    if(!carrier)continue;
    // A caption embedded in the video message is a direct relation.
    if(textOf(carrier).length>=5) continue;
    // Nearby media belong to a *conversation*, not necessarily one work item.
    // Link only where the same author has exactly one caption in five minutes.
    const candidates=captions.filter(m=>m.group_id===carrier.group_id
      && Boolean(carrier.sender_chat_id) && m.sender_chat_id===carrier.sender_chat_id
      && Math.abs(isoTime(m.occurred_at)-isoTime(carrier.occurred_at))<=300000);
    if(candidates.length===1){
      const id=Number(candidates[0].id);
      linkedVideos.set(id,[...(linkedVideos.get(id)||[]),video]);
    }else unassigned.push(video);
  }
  const rows=[];
  for(const m of captions){
    const group=allowed.get(m.group_id);
    if(!group)continue;
    const groupArea=whatsappSourceArea(group.display_name);
    const raw=textOf(m);
    const chunks=extractWhatsappSections({groupName:group.display_name,text:raw});
    const parts=chunks.length?chunks:[{
      title:'Novedad informada',excerpt:raw.slice(0,350),
      proposal:suggestWhatsappSection({groupName:group.display_name,text:raw,
        messageType:m.message_type}),reportedState:'unclear',
    }];
    const sourceLines=raw.replace(/\r/g,'').split('\n');
    for(let i=0;i<parts.length;i++){
      const part=parts[i];
      const destinationId=part.proposal?.id||'needs_routing';
      if(mode==='drilling' && destinationId!=='mine_drilling')continue;
      if(mode==='maintenance' && destinationId!=='mine_equipment')continue;
      if(mode==='mine' && (destinationId==='mine_drilling'||destinationId==='mine_equipment'))continue;
      const exact=(byMessage.get(Number(m.id))||[]).filter(a=>isImage(a.mime_type)||isVideo(a.mime_type));
      const near=linkedVideos.get(Number(m.id))||[];
      const isMultiPart=parts.length>1;
      const evidences=[...exact.map(a=>fileOut(a,isMultiPart?'adjunto_de_reporte':'adjunto')),
        ...near.map(a=>fileOut(a,'mismo_remitente_y_intervalo'))].slice(0,10);
      const segment=Number.isInteger(part.lineStart)&&Number.isInteger(part.lineEnd)
        ?sourceLines.slice(part.lineStart-1,part.lineEnd).join('\n').trim()
        :raw;
      rows.push({
        id:String(m.id)+'-'+i,sourceMessageId:Number(m.id),
        area:groupArea,groupName:group.display_name,
        destination:part.proposal?.label||group.display_name,
        destinationId,
        reportedState:part.reportedState||part.proposal?.reportedState||'unclear',
        text:segment.slice(0,4000),
        reportedAt:m.occurred_at||m.received_at,
        receivedAt:m.received_at||null,
        sourceEvidence:evidences,partial:Array.isArray(chunks)&&chunks.length>1,
      });
    }
  }
  rows.sort((a,b)=>isoTime(b.reportedAt)-isoTime(a.reportedAt)
    || b.sourceMessageId-a.sourceMessageId);
  const maxRows=Number.isSafeInteger(limit)?Math.min(Math.max(limit,1),30):16;
  const current=rows.slice(0,maxRows);
  const newest=rows.length?rows[0].reportedAt:null;
  const additionalVideoEvidence = (mode==='drilling'||mode==='maintenance')?[]:unassigned
    .sort((a,b)=>{
      const am=sourceMessages.find(m=>Number(m.id)===Number(a.message_id));
      const bm=sourceMessages.find(m=>Number(m.id)===Number(b.message_id));
      return isoTime(bm?.occurred_at)-isoTime(am?.occurred_at);
    }).slice(0,12).map(a=>{
      const carrier=sourceMessages.find(m=>Number(m.id)===Number(a.message_id));
      return {...fileOut(a,'sin_asociacion_inequivoca'),
        reportedAt:carrier?.occurred_at||carrier?.received_at||null,
        groupName:allowed.get(a.group_id)?.display_name||'Grupo autorizado'};
    });
  return {mode,latestReportedAt:newest,sourceCount:rows.length,
    hasMore:rows.length>maxRows,updates:current,unassignedVideos:additionalVideoEvidence};
}

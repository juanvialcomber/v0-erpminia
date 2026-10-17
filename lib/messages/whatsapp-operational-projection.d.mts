export type WhatsappActivityMode='overview'|'plant'|'mine'|'dispatch'|'drilling';
export type WhatsappSourceGroup={id:string;display_name:string;chat_id:string;enabled:boolean};
export type WhatsappSourceMessage={
  id:number;organization_id?:string;group_id:string;sender_chat_id:string|null;
  message_type:string;body:string|null;occurred_at:string|null;received_at:string|null;
};
export type WhatsappSourceAttachment={
  id:string;message_id:number;group_id:string;mime_type:string|null;download_status:string;
};
export type WhatsappActivityEvidence={
  id:string;mimeType:string;label:string;
  association:'adjunto'|'adjunto_de_reporte'|'mismo_remitente_y_intervalo'|'sin_asociacion_inequivoca';
  reportedAt?:string|null;groupName?:string;
};
export type WhatsappActivityUpdate={
  id:string;sourceMessageId:number;area:'plant'|'mine'|'dispatch'|null;
  groupName:string;destination:string;destinationId:string;reportedState:string;
  text:string;reportedAt:string;receivedAt:string|null;
  sourceEvidence:WhatsappActivityEvidence[];partial:boolean;
};
export type WhatsappActivityFeed={
  mode:WhatsappActivityMode;latestReportedAt:string|null;sourceCount:number;
  hasMore:boolean;updates:WhatsappActivityUpdate[];unassignedVideos:WhatsappActivityEvidence[];
};
export const EXCLUDED_CHAT_ID:string;
export function whatsappSourceArea(name:string):'plant'|'mine'|'dispatch'|null;
export function validSourceMode(value:unknown):value is WhatsappActivityMode;
export function groupPermittedForMode(group:WhatsappSourceGroup,mode?:WhatsappActivityMode):boolean;
export function projectWhatsappActivity(input?:{
 groups?:WhatsappSourceGroup[];messages?:WhatsappSourceMessage[];
 attachments?:WhatsappSourceAttachment[];mode?:WhatsappActivityMode;limit?:number;
}):WhatsappActivityFeed;

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { GREEN_NO_STORE, greenDb, localDay } from '@/lib/messages/greenapi';
import { isExcludedMotilWhatsappGroup } from '@/lib/messages/greenapi-group-scope';
import { whatsappOperationalReviewEnabled } from '@/lib/messages/whatsapp-operational-feature.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[1-9]\d{0,15}$/;

// Source detail is fetched on demand; never return full multi-thousand-char
// mine shift reports for every row in a 250-message list.
export async function GET(request: NextRequest) {
  const auth = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!auth.authorized || !auth.organizationId) return auth.response ||
    NextResponse.json({error:'Sin acceso a los mensajes'},{
      status:403,headers:GREEN_NO_STORE,
    });
  if (!whatsappOperationalReviewEnabled()) {
    return NextResponse.json({error:'Revisión operacional pendiente de habilitación'},
      {status:503,headers:GREEN_NO_STORE});
  }
  const id = request.nextUrl.searchParams.get('id') || '';
  const date = request.nextUrl.searchParams.get('date') || '';
  if (!ID.test(id) || !DATE.test(date)) {
    return NextResponse.json({error:'Identificador o fecha inválidos'},{
      status:400,headers:GREEN_NO_STORE,
    });
  }
  const db = greenDb();
  const {data:message,error:messageError} = await db.from('motil_whatsapp_messages')
    .select('id,group_id,sender_name,body,message_type,occurred_at,received_at')
    .eq('organization_id',auth.organizationId).eq('id',Number(id)).maybeSingle();
  if (messageError) return NextResponse.json({error:'Origen no disponible'},{
    status:503,headers:GREEN_NO_STORE,
  });
  if (!message || !message.occurred_at || localDay(new Date(message.occurred_at))!==date) {
    return NextResponse.json({error:'Mensaje no disponible en esta fecha'},{
      status:404,headers:GREEN_NO_STORE,
    });
  }
  const {data:group,error:groupError} = await db.from('motil_whatsapp_groups')
    .select('id,display_name,chat_id').eq('id',message.group_id)
    .eq('organization_id',auth.organizationId).eq('enabled',true).maybeSingle();
  if (groupError) return NextResponse.json({error:'No se pudo verificar el grupo'},{
    status:503,headers:GREEN_NO_STORE,
  });
  if (!group || isExcludedMotilWhatsappGroup(group.chat_id)) return NextResponse.json({error:'Grupo no autorizado o desactivado'},{
    status:403,headers:GREEN_NO_STORE,
  });
  const {data:attachments,error:attachmentError} = await db.from('motil_whatsapp_attachments')
    .select('id,download_status,scan_status,original_file_name,mime_type')
    .eq('organization_id',auth.organizationId).eq('message_id',message.id)
    .limit(10);
  if (attachmentError) return NextResponse.json({error:'Evidencias no disponibles'},{
    status:503,headers:GREEN_NO_STORE,
  });
  const body=typeof message.body==='string'?message.body:'';
  return NextResponse.json({
    id:message.id,groupName:group.display_name,
    occurredAt:message.occurred_at,receivedAt:message.received_at,
    senderName:message.sender_name,messageType:message.message_type,
    body:body.slice(0,20000),bodyTruncated:body.length>20000,
    attachments:attachments||[],
  },{headers:GREEN_NO_STORE});
}

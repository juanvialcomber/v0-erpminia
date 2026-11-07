export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const { data, error } = await context.supabase
    .from('legal_notifications')
    .select('id,type,title,message,entity_type,entity_id,metadata,read_at,created_at')
    .eq('organization_id', context.organizationId)
    .eq('user_id', context.userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: 'No se pudieron cargar notificaciones de Legal' }, { status: 503 });
  }

  const notifications = data || [];
  return NextResponse.json({
    notifications,
    summary: {
      total: notifications.length,
      unread: notifications.filter((item) => !item.read_at).length,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { error } = await context.supabase
    .from('legal_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', context.organizationId)
    .eq('user_id', context.userId);

  if (error) return NextResponse.json({ error: 'No se pudo marcar la notificación' }, { status: 503 });
  return NextResponse.json({ ok: true });
}

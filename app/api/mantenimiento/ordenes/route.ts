export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveAuthContext } from '@/lib/api/auth-session';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const auth = await resolveAuthContext(request);

  if (!auth) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('mantenimiento_ordenes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ordenes: [], warning: error.message });
  }

  return NextResponse.json({ ordenes: data || [] });
}

export async function POST() {
  return NextResponse.json(
    {
      error: 'Este endpoint legacy es de solo lectura. Crea nuevas OT en maintenance_work_orders mediante el flujo canónico.',
    },
    { status: 410 },
  );
}

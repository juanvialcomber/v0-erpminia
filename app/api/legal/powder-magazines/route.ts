export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysBetween(targetDate: string | null, today: string) {
  if (!targetDate) return null;
  const target = new Date(`${targetDate.slice(0,10)}T12:00:00Z`).getTime();
  const base = new Date(`${today}T12:00:00Z`).getTime();
  return Math.round((target - base) / 86400000);
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const { data, error } = await context.supabase
    .from('legal_powder_magazine_permits')
    .select('id,location_name,resolution_number,expiry_date,next_expiry_date,mining_property,capacity,source_file,source_file_sha256,source_sheet,source_row,updated_at')
    .eq('organization_id', context.organizationId)
    .order('location_name');

  if (error) return NextResponse.json({ error: 'No se pudieron cargar vencimientos de polvorines' }, { status: 503 });

  const today = todayKey();
  const items = (data || []).map((row) => {
    const targetExpiry = row.next_expiry_date || row.expiry_date || null;
    const daysUntil = daysBetween(targetExpiry, today);
    return {
      ...row,
      target_expiry_date: targetExpiry,
      days_until: daysUntil,
      alert_15_days: typeof daysUntil === 'number' && daysUntil >= 0 && daysUntil <= 15,
      overdue: typeof daysUntil === 'number' && daysUntil < 0,
      missing_evidence: !row.resolution_number || !targetExpiry,
    };
  }).sort((a,b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.alert_15_days !== b.alert_15_days) return a.alert_15_days ? -1 : 1;
    if (a.missing_evidence !== b.missing_evidence) return a.missing_evidence ? -1 : 1;
    return String(a.target_expiry_date || '9999-12-31').localeCompare(String(b.target_expiry_date || '9999-12-31'));
  });

  return NextResponse.json({
    data: items,
    summary: {
      total: items.length,
      alert_15_days: items.filter((item) => item.alert_15_days).length,
      overdue: items.filter((item) => item.overdue).length,
      missing_evidence: items.filter((item) => item.missing_evidence).length,
    },
    policy: {
      alert_days: 15,
      source: 'Vencimientos Polvorines La Patagua.xlsx',
      rule: 'La alerta se activa 15 días antes de la fecha de renovación vigente informada. Si existe próxima fecha, ésta prevalece sobre el vencimiento histórico.',
    },
  });
}

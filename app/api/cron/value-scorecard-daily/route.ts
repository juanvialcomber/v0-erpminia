import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function chileBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function capture(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const snapshotDate = chileBusinessDate();

  const { data: organizations, error: organizationError } = await supabase
    .from('organizations')
    .select('id');

  if (organizationError) {
    return NextResponse.json({ error: 'No fue posible listar organizaciones.' }, { status: 500 });
  }

  const results: Array<{ organizationId: string; evidenceLevel: string; scaleGate: string }> = [];

  for (const organization of organizations || []) {
    const { data, error } = await supabase.rpc('motil_capture_value_scorecard_snapshot', {
      p_organization_id: organization.id,
      p_snapshot_date: snapshotDate,
    });

    if (error) {
      console.error('[value-scorecard-snapshot]', organization.id, error);
      return NextResponse.json({ error: 'No fue posible capturar Valor MOTIL.' }, { status: 500 });
    }

    results.push({
      organizationId: organization.id,
      evidenceLevel: data?.evidenceLevel || 'E1',
      scaleGate: data?.scaleGate || 'CONDITIONAL',
    });
  }

  return NextResponse.json({
    ok: true,
    snapshotDate,
    timeZone: 'America/Santiago',
    organizations: results,
  });
}

export async function GET(request: NextRequest) {
  return capture(request);
}

export async function POST(request: NextRequest) {
  return capture(request);
}

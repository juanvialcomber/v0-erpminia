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

  const { data: organizations, error: organizationsError } = await supabase
    .from('organizations')
    .select('id')
    .order('id', { ascending: true });

  if (organizationsError) {
    console.error('[value-scorecard-daily] organizations:', organizationsError.message);
    return NextResponse.json({ error: 'No fue posible resolver organizaciones' }, { status: 500 });
  }

  const results: Array<{
    organizationId: string;
    evidenceLevel: string | null;
    workflowLevel: number | null;
    scaleGate: string | null;
  }> = [];

  for (const organization of organizations || []) {
    const { data, error } = await supabase.rpc('motil_capture_value_scorecard_snapshot', {
      p_organization_id: organization.id,
      p_snapshot_date: snapshotDate,
    });

    if (error) {
      console.error(`[value-scorecard-daily] ${organization.id}:`, error.message);
      return NextResponse.json(
        { error: 'No fue posible capturar el snapshot diario de valor' },
        { status: 500 },
      );
    }

    results.push({
      organizationId: organization.id,
      evidenceLevel: typeof data?.evidenceLevel === 'string' ? data.evidenceLevel : null,
      workflowLevel: Number.isFinite(Number(data?.workflowLevel)) ? Number(data.workflowLevel) : null,
      scaleGate: typeof data?.scaleGate === 'string' ? data.scaleGate : null,
    });
  }

  return NextResponse.json({
    ok: true,
    snapshotDate,
    timeZone: 'America/Santiago',
    organizations: results.length,
    results,
    semantics: 'daily evidence snapshot; not audited savings or economic ROI',
  });
}

export async function GET(request: NextRequest) {
  return capture(request);
}

export async function POST(request: NextRequest) {
  return capture(request);
}

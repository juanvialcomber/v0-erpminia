export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { resolveMotilSkillAvailability } from '@/lib/motil-ai/skills/runtime-availability';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const runtime = await resolveMotilSkillAvailability(context);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      sourceState: runtime.sourceState,
      summary: runtime.summary,
      skills: runtime.skills,
    });
  } catch (error) {
    console.error('[motil-ai/skills/availability]', error);
    return NextResponse.json({ error: 'No fue posible calcular las capacidades disponibles.' }, { status: 500 });
  }
}

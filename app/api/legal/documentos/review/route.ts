export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireDocumentModuleAccess } from '@/lib/api/document-module-access';

type ReviewLevel = 'L1' | 'L2';
type ReviewStatus = 'cumple' | 'no_cumple' | null;
type ReviewRequestBody = {
  docId?: string;
  level?: ReviewLevel | string;
  status?: ReviewStatus;
  observations?: string;
};

export async function POST(request: NextRequest) {
  const access = await requireDocumentModuleAccess(request, 'legal', true);
  if (!access.authorized) return access.response;
  if (!access.organizationId || !access.user) {
    return NextResponse.json({ error: 'Organización activa requerida' }, { status: 403 });
  }
  const supabase = await createClient();

  const { docId, level, status, observations } = (await request.json()) as ReviewRequestBody;

  if (!docId || !level || status === null || status === undefined) {
    return NextResponse.json(
      { error: 'docId, level, y status son requeridos' },
      { status: 400 }
    );
  }

  if (status === 'no_cumple' && !observations?.trim()) {
    return NextResponse.json(
      { error: 'Las observaciones son requeridas al rechazar' },
      { status: 400 }
    );
  }

  const updateData: Record<string, string | null> = {
    [`${level.toLowerCase()}_status`]: status,
    [`${level.toLowerCase()}_observations`]: observations || null,
    [`reviewed_by_${level.toLowerCase()}`]: access.user.id,
    [`reviewed_at_${level.toLowerCase()}`]: new Date().toISOString(),
  };

  // If L1 approves, document moves to under_review; if L1 rejects, stays in draft
  if (level === 'L1') {
    updateData.status = status === 'cumple' ? 'under_review_l2' : 'under_review_l1';
  }
  // If L2 approves, document is approved; if rejects, goes back to under_review_l1
  if (level === 'L2') {
    updateData.status = status === 'cumple' ? 'approved' : 'under_review_l1';
  }

  const { data, error } = await supabase
    .from('module_documents')
    .update(updateData)
    .eq('id', docId)
    .eq('organization_id', access.organizationId)
    .eq('module', 'legal')
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send email notification about the review
  try {
    const emailRes = await fetch(
      new URL('/api/legal/notifications/email', request.url),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': request.headers.get('cookie') || '',
        },
        body: JSON.stringify({
          docId,
          documentTitle: data.document_name,
          reviewLevel: level,
          status,
          observations,
          recipientEmail: access.user.email,
        }),
      }
    );

    if (!emailRes.ok) {
      console.warn('[v0] Email notification failed:', await emailRes.text());
    }
  } catch (emailError) {
    console.warn('[v0] Error sending email notification:', emailError);
    // Don't fail the review if email fails
  }

  return NextResponse.json({ document: data }, { status: 200 });
}

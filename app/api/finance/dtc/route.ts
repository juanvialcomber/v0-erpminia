export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const EMPTY = {
  schemaReady: false,
  source: 'SII' as const,
  readOnly: true as const,
  rows: [],
  summary: { total: 0, accepted: 0, pending: 0, rejected: 0 },
};

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase
    .from('sii_dte_documents')
    .select('id,dte_type,folio,issue_date,recipient_name,recipient_rut,net_amount,vat_amount,total_amount,sii_track_id,sii_status,payment_status')
    .eq('organization_id', context.organizationId)
    .order('issue_date', { ascending: false })
    .order('folio', { ascending: false })
    .limit(100);

  if (error) {
    const relationMissing = error.code === 'PGRST205' || error.code === '42P01' || /sii_dte_documents/i.test(error.message || '');
    if (relationMissing) return NextResponse.json(EMPTY);
    console.error('[finance/dtc]', error);
    return NextResponse.json({ error: 'No fue posible cargar Facturación SII.' }, { status: 500 });
  }

  const rows = (data || []).map((row) => ({
    id: String(row.id),
    dteType: Number(row.dte_type),
    folio: row.folio === null ? null : Number(row.folio),
    issueDate: row.issue_date,
    recipientName: row.recipient_name,
    recipientRut: row.recipient_rut,
    netAmount: row.net_amount === null ? null : Number(row.net_amount),
    vatAmount: row.vat_amount === null ? null : Number(row.vat_amount),
    totalAmount: row.total_amount === null ? null : Number(row.total_amount),
    siiTrackId: row.sii_track_id,
    siiStatus: row.sii_status,
    paymentStatus: row.payment_status,
  }));

  const accepted = rows.filter((row) => row.siiStatus === 'EPR' || row.siiStatus === 'ACEPTADO').length;
  const rejected = rows.filter((row) => row.siiStatus === 'RECHAZADO').length;
  const pending = rows.length - accepted - rejected;

  return NextResponse.json({
    schemaReady: true,
    source: 'SII',
    readOnly: true,
    rows,
    summary: { total: rows.length, accepted, pending, rejected },
  });
}

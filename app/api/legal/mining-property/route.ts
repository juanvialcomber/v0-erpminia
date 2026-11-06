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

  const [propertiesResult, royaltiesResult] = await Promise.all([
    context.supabase
      .from('mining_properties')
      .select('id,representative_name,property_name,patent_value_clp,source_file,source_sheet,source_row,updated_at')
      .eq('organization_id', context.organizationId)
      .order('property_name', { ascending: true }),
    context.supabase
      .from('mining_property_royalties')
      .select('id,mining_property_id,lot_ref,event_date,tonnes,cu_grade_pct,net_clp,royalty_clp,payment_status,payment_note,destination,notes,source_file,source_sheet,source_row,created_at')
      .eq('organization_id', context.organizationId)
      .order('event_date', { ascending: false, nullsFirst: false }),
  ]);

  if (propertiesResult.error) return NextResponse.json({ error: propertiesResult.error.message }, { status: 500 });
  if (royaltiesResult.error) return NextResponse.json({ error: royaltiesResult.error.message }, { status: 500 });

  const royalties = royaltiesResult.data || [];
  const royaltiesByProperty = new Map<string, typeof royalties>();
  for (const row of royalties) {
    const current = royaltiesByProperty.get(row.mining_property_id) || [];
    current.push(row);
    royaltiesByProperty.set(row.mining_property_id, current);
  }

  const properties = (propertiesResult.data || []).map((property) => {
    const propertyRoyalties = royaltiesByProperty.get(property.id) || [];
    const royaltyTotal = propertyRoyalties.reduce((sum, row) => sum + Number(row.royalty_clp || 0), 0);
    const tonnesTotal = propertyRoyalties.reduce((sum, row) => sum + Number(row.tonnes || 0), 0);
    const paid = propertyRoyalties.filter((row) => String(row.payment_status || '').toLowerCase() === 'paid').length;
    const pending = propertyRoyalties.length - paid;
    const latest = propertyRoyalties.find((row) => row.event_date)?.event_date || null;

    return {
      ...property,
      royalty_count: propertyRoyalties.length,
      royalty_total_clp: royaltyTotal,
      tonnes_total: tonnesTotal,
      paid_events: paid,
      pending_events: pending,
      latest_event_date: latest,
      royalties: propertyRoyalties.slice(0, 12),
    };
  });

  const totalRoyalty = royalties.reduce((sum, row) => sum + Number(row.royalty_clp || 0), 0);
  const totalTonnes = royalties.reduce((sum, row) => sum + Number(row.tonnes || 0), 0);
  const paidEvents = royalties.filter((row) => String(row.payment_status || '').toLowerCase() === 'paid').length;

  return NextResponse.json({
    data: properties,
    summary: {
      properties: properties.length,
      royalties: royalties.length,
      royalty_total_clp: totalRoyalty,
      tonnes_total: totalTonnes,
      paid_events: paidEvents,
      pending_events: royalties.length - paidEvents,
      latest_event_date: royalties.find((row) => row.event_date)?.event_date || null,
    },
    lineage: {
      property_table: 'mining_properties',
      royalty_table: 'mining_property_royalties',
      note: 'Datos promovidos desde Control Arriendo de propiedades (1).xlsx. Los estados de pago se muestran tal como vienen de la fuente; no se infieren pagos faltantes.',
    },
    accessLevel: access,
  });
}

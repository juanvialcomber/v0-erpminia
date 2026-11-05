export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const [integration, siiImports, outbound, laudusDtes] = await Promise.all([
    context.supabase
      .from('sii_integrations')
      .select('environment,company_rut,certificate_secret_id,certificate_valid_to,last_auth_ok')
      .eq('organization_id', context.organizationId)
      .maybeSingle(),
    context.supabase
      .from('procurement_sii_dte_imports')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId),
    context.supabase
      .from('sii_outbound_dtes')
      .select('id,status', { count: 'exact' })
      .eq('organization_id', context.organizationId),
    context.supabase
      .from('laudus_dtes_service_v1')
      .select('id,issuer_tax_id,receiver_tax_id,issued_date')
      .eq('organization_id', context.organizationId)
      .limit(100),
  ]);

  const error = integration.error || siiImports.error || outbound.error || laudusDtes.error;
  if (error) {
    console.error('[sii/replacement-readiness]', error);
    return NextResponse.json({ error: 'No fue posible calcular la preparación de reemplazo DTE.' }, { status: 500 });
  }

  const cfg = integration.data;
  const certificateValid = Boolean(
    cfg?.certificate_secret_id
    && cfg?.certificate_valid_to
    && Date.parse(cfg.certificate_valid_to) > Date.now(),
  );
  const siiConfigured = Boolean(cfg?.company_rut && certificateValid);
  const directSourceCount = (siiImports.count || 0) + ((outbound.data || []).length || 0);
  const laudusRows = laudusDtes.data || [];
  const laudusIncompleteParties = laudusRows.filter((row) => !row.issuer_tax_id || !row.receiver_tax_id).length;

  const blockers = [
    !siiConfigured ? 'Configurar identidad/certificado SII real.' : null,
    cfg?.last_auth_ok !== true ? 'Validar autenticación directa con SII.' : null,
    directSourceCount === 0 ? 'Ingerir DTE reales desde SII/RCV o fuente fiscal autorizada.' : null,
  ].filter(Boolean);

  return NextResponse.json({
    authorityTarget: 'SII_DIRECT',
    laudusRoleTarget: 'historical_reference_only',
    status: blockers.length === 0 ? 'ready' : 'blocked',
    directSii: {
      configured: siiConfigured,
      authenticated: cfg?.last_auth_ok === true,
      importedInboundDtes: siiImports.count || 0,
      outboundDtes: (outbound.data || []).length,
      evidenceCount: directSourceCount,
    },
    laudus: {
      dtesObserved: laudusRows.length,
      incompleteParties: laudusIncompleteParties,
      adequateAsFiscalAuthority: false,
    },
    blockers,
    safety: {
      emitsDte: false,
      consumesCaf: false,
      filesTaxReturn: false,
      paysTax: false,
    },
  });
}

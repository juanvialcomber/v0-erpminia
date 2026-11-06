export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

async function authorize(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return { ok: false as const, response: context.response };

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 }),
    };
  }

  return { ok: true as const, context, access };
}

function dateKey(value: unknown) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 10) : null;
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysFromToday(value: string | null, today: string) {
  if (!value) return null;
  const target = new Date(`${value}T12:00:00Z`).getTime();
  const base = new Date(`${today}T12:00:00Z`).getTime();
  return Math.round((target - base) / 86_400_000);
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const organizationId = auth.context.organizationId;
  const today = todayKey();

  const [casesResult, payablesResult, paymentRequestsResult, progressResult, complianceResult, royaltiesResult] = await Promise.all([
    auth.context.supabase
      .from('legal_cases')
      .select('id,title,reason,priority,operational_owner,legal_owner,due_at,status,evidence_status,source_module,source_href,updated_at,created_at')
      .eq('organization_id', organizationId)
      .neq('status', 'closed')
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500),
    auth.context.supabase
      .from('procurement_accounts_payable')
      .select('id,invoice_id,supplier_id,currency,approved_amount,due_date,status')
      .eq('organization_id', organizationId)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .limit(500),
    auth.context.supabase
      .from('finance_payment_requests')
      .select('id,payable_id,amount,currency,requested_payment_date,status,required_signatures,executed_at,bank_reference,evidence_url,evidence_document_id,created_at,updated_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(500),
    auth.context.supabase
      .from('contract_progress_updates')
      .select('id,contract_id,execution_percentage,evidence_document_id,status,submitted_at,updated_at')
      .eq('organization_id', organizationId)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true })
      .limit(500),
    auth.context.supabase
      .from('compliance_events')
      .select('id,event_type,title,description,due_date,next_date,status,location,priority,updated_at,created_at')
      .eq('org_id', organizationId)
      .eq('event_type', 'legal')
      .eq('status', 'pending')
      .order('next_date', { ascending: true, nullsFirst: false })
      .order('due_date', { ascending: true })
      .limit(200),
    auth.context.supabase
      .from('mining_property_royalties')
      .select('id,mining_property_id,lot_ref,event_date,royalty_clp,payment_status,payment_note,destination,created_at')
      .eq('organization_id', organizationId)
      .in('payment_status', ['unpaid', 'partial', 'unknown'])
      .order('event_date', { ascending: false, nullsFirst: false })
      .limit(200),
  ]);

  const warnings: string[] = [];
  if (casesResult.error) warnings.push('No se pudieron cargar los casos legales.');
  if (payablesResult.error) warnings.push('No se pudieron cargar las cuentas por pagar.');
  if (paymentRequestsResult.error) warnings.push('No se pudieron cargar las solicitudes de pago.');
  if (progressResult.error && progressResult.error.code !== '42P01') {
    warnings.push('No se pudieron cargar los avances contractuales pendientes.');
  }
  if (complianceResult.error) warnings.push('No se pudieron cargar los vencimientos legales.');
  if (royaltiesResult.error) warnings.push('No se pudieron cargar las regalías con estado pendiente o incierto.');

  const payableRows = payablesResult.data || [];
  const invoiceIds = payableRows.map((row) => row.invoice_id).filter(Boolean);
  const supplierIds = payableRows.map((row) => row.supplier_id).filter(Boolean);
  const progressRows = progressResult.error ? [] : progressResult.data || [];
  const progressContractIds = Array.from(new Set(progressRows.map((row) => row.contract_id).filter(Boolean)));
  const royaltyRows = royaltiesResult.error ? [] : royaltiesResult.data || [];
  const royaltyPropertyIds = Array.from(new Set(royaltyRows.map((row) => row.mining_property_id).filter(Boolean)));

  const [invoicesResult, suppliersResult, signaturesResult, progressContractsResult, royaltyPropertiesResult] = await Promise.all([
    invoiceIds.length
      ? auth.context.supabase
          .from('procurement_supplier_invoices')
          .select('id,invoice_number,supplier_id')
          .eq('organization_id', organizationId)
          .in('id', invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length
      ? auth.context.supabase
          .from('canonical_suppliers_v1')
          .select('id,legal_name,trade_name')
          .eq('organization_id', organizationId)
          .in('id', supplierIds)
      : Promise.resolve({ data: [], error: null }),
    auth.context.supabase
      .from('finance_payment_request_signatures')
      .select('id,request_id,decision,signer_id,signed_at')
      .eq('organization_id', organizationId)
      .limit(1000),
    progressContractIds.length
      ? auth.context.supabase
          .from('contracts')
          .select('id,contract_number,title,contractor_name,responsible_person,responsible_area')
          .eq('organization_id', organizationId)
          .in('id', progressContractIds)
      : Promise.resolve({ data: [], error: null }),
    royaltyPropertyIds.length
      ? auth.context.supabase
          .from('mining_properties')
          .select('id,property_name,representative_name')
          .eq('organization_id', organizationId)
          .in('id', royaltyPropertyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (invoicesResult.error) warnings.push('No se pudieron resolver las facturas.');
  if (suppliersResult.error) warnings.push('No se pudieron resolver los proveedores.');
  if (signaturesResult.error) warnings.push('No se pudieron resolver las firmas de pago.');
  if (progressContractsResult.error) warnings.push('No se pudieron resolver los contratos de los avances.');
  if (royaltyPropertiesResult.error) warnings.push('No se pudieron resolver las propiedades de las regalías.');

  const invoicesById = new Map((invoicesResult.data || []).map((row) => [row.id, row]));
  const suppliersById = new Map((suppliersResult.data || []).map((row) => [row.id, row]));
  const progressContractsById = new Map((progressContractsResult.data || []).map((row) => [row.id, row]));
  const royaltyPropertiesById = new Map((royaltyPropertiesResult.data || []).map((row) => [row.id, row]));
  const paymentRequestByPayable = new Map((paymentRequestsResult.data || []).map((row) => [row.payable_id, row]));
  const signaturesByRequest = new Map<string, number>();

  for (const signature of signaturesResult.data || []) {
    if (signature.decision !== 'approved') continue;
    signaturesByRequest.set(signature.request_id, (signaturesByRequest.get(signature.request_id) || 0) + 1);
  }

  const legalItems = (casesResult.data || []).map((row) => {
    const dueDate = dateKey(row.due_at);
    const daysUntil = daysFromToday(dueDate, today);
    return {
      id: `legal:${row.id}`,
      kind: 'legal_case',
      area: 'Legal',
      title: row.title,
      detail: row.reason,
      due_date: dueDate,
      days_until: daysUntil,
      overdue: typeof daysUntil === 'number' && daysUntil < 0,
      status: row.status,
      priority: row.priority,
      owner: row.legal_owner || row.operational_owner,
      evidence_status: row.evidence_status,
      signatures_required: null,
      signatures_done: null,
      amount: null,
      currency: null,
      source_href: row.source_href || '/dashboard/legal/casos',
      updated_at: row.updated_at || row.created_at,
    };
  });

  const financeItems = payableRows
    .filter((row) => !['paid', 'pagado', 'cancelled', 'canceled', 'void', 'voided'].includes(String(row.status || '').toLowerCase()))
    .map((row) => {
      const invoice = row.invoice_id ? invoicesById.get(row.invoice_id) : null;
      const supplier = row.supplier_id ? suppliersById.get(row.supplier_id) : null;
      const paymentRequest = paymentRequestByPayable.get(row.id);
      const dueDate = dateKey(row.due_date);
      const daysUntil = daysFromToday(dueDate, today);
      const signaturesRequired = paymentRequest?.required_signatures ?? 2;
      const signaturesDone = paymentRequest ? signaturesByRequest.get(paymentRequest.id) || 0 : 0;
      const paymentStatus = paymentRequest?.status || 'payment_not_requested';

      return {
        id: `payable:${row.id}`,
        kind: 'payable',
        area: 'Finanzas',
        title: invoice?.invoice_number ? `Factura ${invoice.invoice_number}` : 'Cuenta por pagar',
        detail: supplier?.trade_name || supplier?.legal_name || 'Proveedor sin resolver',
        due_date: dueDate,
        days_until: daysUntil,
        overdue: typeof daysUntil === 'number' && daysUntil < 0,
        status: paymentStatus,
        priority: typeof daysUntil === 'number' && daysUntil < 0 ? 'critical' : typeof daysUntil === 'number' && daysUntil <= 7 ? 'high' : 'medium',
        owner: null,
        evidence_status: paymentRequest?.executed_at
          ? (paymentRequest.evidence_document_id || paymentRequest.evidence_url ? 'complete' : 'pending')
          : 'pending',
        signatures_required: signaturesRequired,
        signatures_done: signaturesDone,
        amount: paymentRequest?.amount ?? row.approved_amount ?? null,
        currency: paymentRequest?.currency ?? row.currency ?? null,
        source_href: '/dashboard/finanzas/pagos',
        updated_at: paymentRequest?.updated_at || paymentRequest?.created_at || null,
      };
    });

  const complianceItems = (complianceResult.data || [])
    .filter((row) => String(row.description || '').includes('[POLVORIN]'))
    .flatMap((row) => {
      const alertDate = dateKey(row.next_date) || dateKey(row.due_date);
      const expiryDate = dateKey(row.due_date);
      const daysUntilAlert = daysFromToday(alertDate, today);
      const daysUntilExpiry = daysFromToday(expiryDate, today);
      const shouldSurface =
        typeof daysUntilAlert === 'number' &&
        daysUntilAlert <= 30 &&
        (daysUntilExpiry === null || daysUntilExpiry >= 0);

      if (!shouldSurface) return [];

      return [{
        id: `compliance:${row.id}`,
        kind: 'legal_compliance',
        area: 'Legal',
        title: row.title,
        detail: expiryDate
          ? `Renovación requerida antes del ${expiryDate}. Aviso preventivo 15 días antes.`
          : row.description,
        due_date: alertDate,
        days_until: daysUntilAlert,
        overdue: typeof daysUntilAlert === 'number' && daysUntilAlert < 0,
        status: row.status,
        priority: row.priority || 'medium',
        owner: null,
        evidence_status: 'pending',
        signatures_required: null,
        signatures_done: null,
        amount: null,
        currency: null,
        source_href: '/dashboard/legal/permisos-licencias',
        updated_at: row.updated_at || row.created_at,
      }];
    });

  const royaltyItems = royaltyRows.map((row) => {
    const property = royaltyPropertiesById.get(row.mining_property_id);
    const status = String(row.payment_status || 'unknown').toLowerCase();
    const amount = Number(row.royalty_clp || 0);
    return {
      id: 'royalty:' + row.id,
      kind: 'mining_royalty',
      area: 'Propiedad minera',
      title: property?.property_name || 'Regalía de propiedad minera',
      detail: [
        status === 'partial' ? 'Pago parcial informado por fuente' : status === 'unpaid' ? 'No pagada según fuente' : 'Estado de pago no determinado',
        row.lot_ref || row.destination || null,
        row.payment_note || null,
      ].filter(Boolean).join(' · '),
      due_date: null,
      days_until: null,
      overdue: false,
      status,
      priority: status === 'partial' ? 'high' : 'medium',
      owner: property?.representative_name || null,
      evidence_status: 'pending',
      signatures_required: null,
      signatures_done: null,
      amount: amount > 0 ? amount : null,
      currency: amount > 0 ? 'CLP' : null,
      source_href: '/dashboard/legal/propiedad-minera',
      updated_at: row.event_date || row.created_at,
    };
  });
  const progressItems = progressRows.map((row) => {
    const contract = progressContractsById.get(row.contract_id);
    return {
      id: `contract-progress:${row.id}`,
      kind: 'contract_progress',
      area: 'Contratos',
      title: contract?.title || contract?.contract_number || 'Avance contractual',
      detail: contract?.contractor_name
        ? `${contract.contractor_name} · Avance informado ${Number(row.execution_percentage).toFixed(1)}%`
        : `Avance informado ${Number(row.execution_percentage).toFixed(1)}%`,
      due_date: null,
      days_until: null,
      overdue: false,
      status: 'submitted',
      priority: row.evidence_document_id ? 'medium' : 'high',
      owner: contract?.responsible_person || contract?.responsible_area || null,
      evidence_status: row.evidence_document_id ? 'complete' : 'pending',
      signatures_required: null,
      signatures_done: null,
      amount: null,
      currency: null,
      source_href: '/dashboard/legal/avances-contractistas',
      updated_at: row.updated_at || row.submitted_at,
    };
  });

  const data = [...legalItems, ...financeItems, ...progressItems, ...complianceItems, ...royaltyItems].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });

  return NextResponse.json({
    data,
    accessLevel: auth.access,
    warnings,
    summary: {
      total: data.length,
      overdue: data.filter((item) => item.overdue).length,
      due_next_7_days: data.filter((item) => typeof item.days_until === 'number' && item.days_until >= 0 && item.days_until <= 7).length,
      waiting_signatures: data.filter((item) => item.kind === 'payable' && (item.signatures_done || 0) < (item.signatures_required || 0)).length,
      evidence_pending: data.filter((item) => item.evidence_status === 'pending').length,
    },
  });
}

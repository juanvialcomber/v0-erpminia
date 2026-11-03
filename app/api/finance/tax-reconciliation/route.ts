export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getTaxCoreOrganizationCertificateStatus } from '@/lib/integrations/n3uralia-tax/client';

function rutKey(value: unknown) {
  return String(value || '').toUpperCase().replace(/[^0-9K]/g, '');
}

function folioKey(value: unknown) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function amount(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function classifyDocument(documentType: unknown, receiverTaxId: unknown, companyTaxId: string) {
  const type = String(documentType || '').toLowerCase();
  const receiverIsCompany = Boolean(companyTaxId && rutKey(receiverTaxId) === companyTaxId);
  if (type.includes('factura')) return receiverIsCompany ? 'inbound_invoice' : 'outbound_invoice';
  if (type.includes('guía') || type.includes('guia')) return 'waybill';
  return 'other';
}

export async function GET(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.canRead('finance')) {
    return NextResponse.json({ error: 'Sin acceso a conciliación financiera.' }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const companyTaxId = rutKey(process.env.LAUDUS_COMPANY_VAT_ID || '84542800-K');

    const [dtesResult, invoicesResult, siiResult] = await Promise.all([
      context.supabase
        .from('laudus_dtes_service_v1')
        .select('external_id,document_type,folio,issuer_tax_id,receiver_tax_id,issued_date,net_amount,tax_amount,total_amount,currency_code,status,observed_at')
        .eq('organization_id', context.organizationId)
        .order('issued_date', { ascending: false })
        .limit(200),
      context.supabase
        .from('procurement_supplier_invoices')
        .select('id,invoice_number,invoice_date,net_amount,tax_amount,total_amount,currency,status')
        .eq('organization_id', context.organizationId)
        .order('invoice_date', { ascending: false })
        .limit(500),
      getTaxCoreOrganizationCertificateStatus(context.organizationId).catch((error) => ({
        ok: false,
        organizationId: context.organizationId,
        certificateConfigured: false,
        siiWritesEnabled: false,
        unavailableReason: error instanceof Error ? error.message : 'tax_core_unavailable',
      })),
    ]);

    if (dtesResult.error) throw dtesResult.error;
    if (invoicesResult.error) throw invoicesResult.error;

    const invoicesByFolio = new Map(
      (invoicesResult.data || [])
        .filter((row) => folioKey(row.invoice_number))
        .map((row) => [folioKey(row.invoice_number), row]),
    );

    const rows = (dtesResult.data || []).map((dte) => {
      const direction = classifyDocument(dte.document_type, dte.receiver_tax_id, companyTaxId);
      const comparable = direction === 'inbound_invoice';
      const invoice = comparable ? invoicesByFolio.get(folioKey(dte.folio)) || null : null;
      const laudusTotal = amount(dte.total_amount);
      const motilTotal = amount(invoice?.total_amount);

      let motilStatus: 'match' | 'difference' | 'missing' | 'not_modeled' | 'not_comparable';
      if (direction === 'outbound_invoice') motilStatus = 'not_modeled';
      else if (!comparable) motilStatus = 'not_comparable';
      else if (!invoice) motilStatus = 'missing';
      else if (laudusTotal !== null && motilTotal !== null && Math.abs(laudusTotal - motilTotal) <= 1) motilStatus = 'match';
      else motilStatus = 'difference';

      const siiStatus = siiResult?.certificateConfigured
        ? 'connected_pending_document_read'
        : 'pending_connection';

      return {
        id: dte.external_id,
        documentType: dte.document_type,
        folio: dte.folio,
        direction,
        counterpartyTaxId: direction === 'inbound_invoice' ? dte.issuer_tax_id : dte.receiver_tax_id,
        issuedDate: dte.issued_date,
        laudus: {
          status: 'available',
          total: laudusTotal,
          net: amount(dte.net_amount),
          tax: amount(dte.tax_amount),
          currency: dte.currency_code || 'CLP',
          sourceStatus: dte.status,
          observedAt: dte.observed_at,
        },
        motil: invoice
          ? {
              status: motilStatus,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              total: motilTotal,
              net: amount(invoice.net_amount),
              tax: amount(invoice.tax_amount),
              currency: invoice.currency || 'CLP',
              sourceStatus: invoice.status,
            }
          : {
              status: motilStatus,
              invoiceId: null,
              invoiceNumber: null,
              total: null,
              net: null,
              tax: null,
              currency: null,
              sourceStatus: null,
            },
        sii: {
          status: siiStatus,
          certificateConfigured: Boolean(siiResult?.certificateConfigured),
          writesEnabled: false,
        },
      };
    });

    const summary = {
      documents: rows.length,
      matches: rows.filter((row) => row.motil.status === 'match').length,
      differences: rows.filter((row) => row.motil.status === 'difference').length,
      missingInMotil: rows.filter((row) => row.motil.status === 'missing').length,
      outboundNotModeled: rows.filter((row) => row.motil.status === 'not_modeled').length,
      nonComparable: rows.filter((row) => row.motil.status === 'not_comparable').length,
      siiConnected: Boolean(siiResult?.certificateConfigured),
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      organizationId: context.organizationId,
      companyTaxId,
      summary,
      rows,
      boundaries: {
        laudusReadOnly: true,
        motilCanonicalMutated: false,
        siiWritesEnabled: false,
        siiDocumentReadImplemented: false,
      },
    });
  } catch (error) {
    console.error('[finance/tax-reconciliation]', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      error: 'No fue posible construir la conciliación tributaria.',
      rows: [],
      siiWritesEnabled: false,
    }, { status: 500 });
  }
}

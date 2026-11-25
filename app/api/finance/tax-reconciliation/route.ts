export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getTaxCoreOrganizationCertificateStatus, getTaxCoreOrganizationDtes } from '@/lib/integrations/n3uralia-tax/client';
import { classifyTaxDocument, taxDocumentCounterparty } from '@/lib/finance/tax-document-classification.mjs';

function rutKey(value: unknown) {
  return String(value || '').toUpperCase().replace(/[^0-9K]/g, '');
}

function folioKey(value: unknown) {
  return String(value || '').replace(/[^0-9]/g, '');
}

type TaxCoreSourceDocument = {
  tenantRut: string;
  issuerRut: string;
  receiverRut: string;
  tenantRole: 'issuer' | 'receiver' | 'both';
  type: number;
  folio: number;
  issuedAt: string;
  total: number;
  identity: string;
  sha256: string;
  validation: {
    officialSiiXsd: 'PASS' | 'FAIL' | 'UNAVAILABLE';
    unavailableCode?: string;
    errors: Array<{ message: string; fileName: string | null; lineNumber: number | null }>;
    documentSignature: 'NOT_CHECKED';
    ted: 'NOT_CHECKED';
    siiAcceptance: 'NOT_CHECKED';
  };
};

function isTaxCoreSourceDocument(value: unknown): value is TaxCoreSourceDocument {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TaxCoreSourceDocument>;
  const validation = item.validation;
  return rutKey(item.tenantRut) === '84542800K' &&
    typeof item.issuerRut === 'string' && typeof item.receiverRut === 'string' &&
    ['issuer', 'receiver', 'both'].includes(item.tenantRole || '') &&
    Number.isSafeInteger(item.type) && Number.isSafeInteger(item.folio) &&
    typeof item.issuedAt === 'string' && Number.isSafeInteger(item.total) &&
    typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256) &&
    item.identity === `${item.issuerRut}:${item.type}:${item.folio}` &&
    Boolean(validation && ['PASS', 'FAIL', 'UNAVAILABLE'].includes(validation.officialSiiXsd) &&
      Array.isArray(validation.errors) && validation.documentSignature === 'NOT_CHECKED' &&
      validation.ted === 'NOT_CHECKED' && validation.siiAcceptance === 'NOT_CHECKED');
}

function amount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
    // This endpoint is scoped to La Patagua until each tenant has a verified tax identity.
    // Never apply La Patagua's RUT to an unrelated organization.
    const companyTaxId = rutKey(process.env.LAUDUS_COMPANY_VAT_ID || '84542800-K');
    const configuredOrganizationId = String(process.env.LA_PATAGUA_ORGANIZATION_ID || '').trim();
    if (!configuredOrganizationId || configuredOrganizationId !== context.organizationId) {
      return NextResponse.json({ error: 'Conciliación tributaria no configurada para esta organización.' }, { status: 403 });
    }

    const requestUrl = new URL(request.url);
    const taxCorePeriod = requestUrl.searchParams.get('period') || undefined;
    const taxCoreCursor = requestUrl.searchParams.get('taxCoreCursor') || undefined;
    const [dtesResult, invoicesResult, siiResult, taxCoreResult] = await Promise.all([
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
      getTaxCoreOrganizationDtes(context.organizationId, {
        period: taxCorePeriod,
        limit: 50,
        cursor: taxCoreCursor,
      }).catch((error) => ({
        ok: false,
        organizationId: context.organizationId,
        taxpayerRut: null,
        documents: [],
        hasMore: false,
        nextCursor: null,
        siiWritesEnabled: false,
        accountingPromotion: false,
        unavailableReason: error instanceof Error ? error.message : 'tax_core_dte_read_unavailable',
      })),
    ]);

    if (dtesResult.error) throw dtesResult.error;
    if (invoicesResult.error) throw invoicesResult.error;

    // Folios are not globally unique. Never reconcile an ambiguous invoice number.
    const invoicesByFolio = new Map<string, NonNullable<typeof invoicesResult.data>>();
    for (const invoice of invoicesResult.data || []) {
      const key = folioKey(invoice.invoice_number);
      if (!key) continue;
      const candidates = invoicesByFolio.get(key) || [];
      candidates.push(invoice);
      invoicesByFolio.set(key, candidates);
    }

    const taxCoreIdentityMatches =
      taxCoreResult?.ok === true &&
      taxCoreResult.organizationId === context.organizationId &&
      rutKey(taxCoreResult.taxpayerRut) === companyTaxId &&
      taxCoreResult.readOnly === true &&
      taxCoreResult.siiWritesEnabled === false &&
      taxCoreResult.accountingPromotion === false;
    const taxCoreDocuments: TaxCoreSourceDocument[] = taxCoreIdentityMatches && Array.isArray(taxCoreResult.documents)
      ? taxCoreResult.documents.filter(isTaxCoreSourceDocument).map((document: TaxCoreSourceDocument) => ({
          tenantRut: document.tenantRut,
          issuerRut: document.issuerRut,
          receiverRut: document.receiverRut,
          tenantRole: document.tenantRole,
          type: document.type,
          folio: document.folio,
          issuedAt: document.issuedAt,
          total: document.total,
          identity: document.identity,
          sha256: document.sha256,
          validation: document.validation,
        }))
      : [];
    const taxCoreRead = {
      status: taxCoreIdentityMatches ? 'available' as const : 'unavailable' as const,
      period: taxCorePeriod || null,
      documents: taxCoreDocuments,
      hasMore: taxCoreIdentityMatches && Boolean(taxCoreResult.hasMore),
      nextCursor: taxCoreIdentityMatches ? taxCoreResult.nextCursor || null : null,
      invalidDocuments: taxCoreIdentityMatches && Array.isArray(taxCoreResult.documents)
        ? taxCoreResult.documents.length - taxCoreDocuments.length
        : 0,
    };

    const rows = (dtesResult.data || []).map((dte) => {
      const direction = classifyTaxDocument(dte.document_type, dte.issuer_tax_id, dte.receiver_tax_id, companyTaxId);
      const comparable = direction === 'inbound_invoice' || direction === 'purchase_invoice_issued';
      const candidates = comparable ? invoicesByFolio.get(folioKey(dte.folio)) || [] : [];
      const invoice = candidates.length === 1 ? candidates[0] : null;
      const ambiguous = comparable && candidates.length > 1;
      const laudusTotal = amount(dte.total_amount);
      const motilTotal = amount(invoice?.total_amount);

      let motilStatus: 'missing' | 'not_modeled' | 'not_comparable';
      if (direction === 'outbound_invoice') motilStatus = 'not_modeled';
      else if (!comparable) motilStatus = 'not_comparable';
      else if (ambiguous) motilStatus = 'not_comparable';
      else if (!invoice) motilStatus = 'missing';
      else if ((dte.currency_code || 'CLP').toUpperCase() !== (invoice.currency || 'CLP').toUpperCase()) motilStatus = 'not_comparable';
      // Folio alone cannot prove identity across suppliers or DTE types.
      // Keep a potential candidate for review, but never publish a false match.
      else motilStatus = 'not_comparable';

      const siiStatus = siiResult?.certificateConfigured
        ? 'certificate_configured_document_read_unavailable'
        : 'pending_connection';

      return {
        id: dte.external_id,
        documentType: dte.document_type,
        folio: dte.folio,
        direction,
        counterpartyTaxId: taxDocumentCounterparty(direction, dte.issuer_tax_id, dte.receiver_tax_id, companyTaxId),
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
      missingInMotil: rows.filter((row) => row.motil.status === 'missing').length,
      outboundNotModeled: rows.filter((row) => row.motil.status === 'not_modeled').length,
      nonComparable: rows.filter((row) => row.motil.status === 'not_comparable').length,
      siiConnected: false,
      certificateConfigured: Boolean(siiResult?.certificateConfigured),
      taxCoreDocuments: taxCoreDocuments.length,
      taxCoreXsdFailures: taxCoreDocuments.filter((document) => document.validation.officialSiiXsd === 'FAIL').length,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      organizationId: context.organizationId,
      companyTaxId,
      summary,
      rows,
      taxCore: taxCoreRead,
      boundaries: {
        laudusReadOnly: true,
        motilCanonicalMutated: false,
        siiWritesEnabled: false,
        taxCoreMetadataReadImplemented: taxCoreIdentityMatches,
        taxCoreXmlReturned: false,
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

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type TxInput = {
  transaction_date?: string;
  description?: string;
  reference?: string | null;
  amount?: number | string;
  currency?: string | null;
  running_balance?: number | string | null;
  source_row?: number | string | null;
};

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase
    .from('finance_bank_statement_summary_v1')
    .select('*')
    .eq('organization_id', context.organizationId)
    .order('imported_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[finance/bank-statements:get]', error);
    return NextResponse.json({ error: 'No fue posible cargar extractos bancarios MOTIL.' }, { status: 500 });
  }

  return NextResponse.json({
    statements: data || [],
    sourceAuthority: 'MOTIL',
    laudusRequired: false,
    automaticReconciliation: false,
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const sourceName = String(body?.sourceName || '').trim();
  const bankAccountLabel = String(body?.bankAccountLabel || '').trim();
  const currency = String(body?.currency || 'CLP').trim() || 'CLP';
  const transactions = Array.isArray(body?.transactions) ? body.transactions as TxInput[] : [];

  if (!sourceName || !bankAccountLabel || transactions.length === 0 || transactions.length > 5000) {
    return NextResponse.json({ error: 'Extracto bancario inválido o fuera de límite.' }, { status: 400 });
  }

  const normalized = transactions.map((row, index) => ({
    transaction_date: String(row.transaction_date || '').trim(),
    description: String(row.description || '').trim(),
    reference: row.reference == null ? null : String(row.reference).trim(),
    amount: Number(row.amount),
    currency: row.currency == null ? currency : String(row.currency).trim() || currency,
    running_balance: row.running_balance == null || row.running_balance === '' ? null : Number(row.running_balance),
    source_row: row.source_row == null || row.source_row === '' ? index + 1 : Number(row.source_row),
  }));

  const invalid = normalized.find((row) =>
    !/^\d{4}-\d{2}-\d{2}$/.test(row.transaction_date)
    || !row.description
    || !Number.isFinite(row.amount)
    || (row.running_balance != null && !Number.isFinite(row.running_balance))
    || !Number.isInteger(row.source_row)
  );
  if (invalid) {
    return NextResponse.json({ error: 'Hay movimientos bancarios con fecha, descripción o monto inválido.' }, { status: 400 });
  }

  const sourceSha256 = String(body?.sourceSha256 || '').trim()
    || createHash('sha256').update(JSON.stringify({
      sourceName,
      bankAccountLabel,
      currency,
      periodFrom: body?.periodFrom || null,
      periodTo: body?.periodTo || null,
      transactions: normalized,
    })).digest('hex');

  const { data, error } = await context.supabase.rpc('import_finance_bank_statement_v1', {
    p_organization_id: context.organizationId,
    p_source_name: sourceName,
    p_bank_account_label: bankAccountLabel,
    p_currency: currency,
    p_period_from: body?.periodFrom || null,
    p_period_to: body?.periodTo || null,
    p_opening_balance: body?.openingBalance ?? null,
    p_closing_balance: body?.closingBalance ?? null,
    p_source_file_path: body?.sourceFilePath || null,
    p_source_sha256: sourceSha256,
    p_transactions: normalized,
    p_notes: body?.notes || null,
  });

  if (error) {
    console.error('[finance/bank-statements:post]', error);
    return NextResponse.json({ error: 'No fue posible importar el extracto bancario.' }, { status: 409 });
  }

  return NextResponse.json({
    statementImportId: data,
    sourceSha256,
    importedTransactions: normalized.length,
    automaticReconciliationExecuted: false,
    supplierPaymentMutationExecuted: false,
    message: 'Extracto importado como evidencia. La conciliación de pagos sigue requiriendo revisión.',
  });
}

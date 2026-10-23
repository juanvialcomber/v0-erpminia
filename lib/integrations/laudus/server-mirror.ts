import 'server-only';
import { Pool } from 'pg';
import { readSupplierLaudusDetail } from './supplier-detail.mjs';
let pool: Pool | undefined;
export async function supplierLaudusMirror(organizationId: string, taxId: string) {
  if (process.env.LAUDUS_MIRROR_READ_ENABLED !== 'true' || process.env.LAUDUS_ORGANIZATION_ID !== organizationId) return { status: 'not_configured', orders: [] };
  const connectionString = process.env.LAUDUS_MIRROR_DATABASE_URL;
  const companyVATId = process.env.LAUDUS_COMPANY_VAT_ID;
  if (!connectionString || !companyVATId) return { status: 'not_configured', orders: [] };
  try {
    pool ??= new Pool({ connectionString, max: 2, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 5000 });
    return await readSupplierLaudusDetail(pool, { organizationId, companyVATId, taxId });
  } catch {
    return { status: 'unavailable', orders: [] };
  }
}

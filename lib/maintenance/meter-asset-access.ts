import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

// TEMPORARY OPERATING POLICY: authorized maintenance operators can register meter
// readings for any asset in their organization until mine assignments are defined.
// Caller must validate MANT_OPERACIONES write access and tenant ownership first.
// Keep this function as the central switch for later asset-based restrictions.
export async function requireMeterAssetAssignment(
  _request: NextRequest,
  _context: Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>,
  _canonicalAssetId: string,
): Promise<NextResponse | null> {
  return null;
}

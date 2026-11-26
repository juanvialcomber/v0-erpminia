export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { voucherContext } from '@/lib/bodega/voucher-context';
import { uuid } from '@/lib/bodega/voucher-input.mjs';

export async function GET(request: NextRequest) {
  const gate = await voucherContext(request);
  if (!gate.ok) return gate.response;
  const id = request.nextUrl.searchParams.get('id');
  if (!uuid(id)) return NextResponse.json({ error: 'Vale inválido.' }, { status: 400 });
  let q = gate.context.supabase.from('warehouse_consumption_vouchers').select('qr_reference,status,expires_at').eq('organization_id', gate.context.organizationId).eq('id', id!);
  if (!gate.access.can_approve && !gate.access.can_deliver) q = q.eq('requested_by', gate.context.userId);
  const { data, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ error: 'No se pudo cargar el QR.' }, { status: 503 });
  if (!data || data.status !== 'approved' || Date.parse(data.expires_at) <= Date.now()) return NextResponse.json({ error: 'El vale no está aprobado o ya venció.' }, { status: 409 });
  // Reference only; no identity, quantities or authorization secret in the QR.
  const target = `/dashboard/bodega/vales?qr=${data.qr_reference}`;
  const svg = await QRCode.toString(new URL(target, request.nextUrl.origin).href, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 256 });
  return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireMeterAssetAssignment } from '@/lib/maintenance/meter-asset-access';

const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Análisis de fotos no configurado.' }, { status: 503 });
  }

  try {
    const form = await request.formData();
    const photo = form.get('photo');
    if (!(photo instanceof File) || !MIME.has(photo.type) || photo.size <= 0 || photo.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Usa una imagen JPG, PNG o WEBP de hasta 10 MB.' }, { status: 400 });
    }
    const canonicalAssetId = String(form.get('canonicalAssetId') || '').trim();
    const { data: asset, error: assetError } = await context.supabase
      .from('maintenance_canonical_assets_v1').select('id').eq('organization_id', context.organizationId)
      .eq('id', canonicalAssetId).maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return NextResponse.json({ error: 'Equipo no autorizado.' }, { status: 404 });
    const denied = await requireMeterAssetAssignment(request, context, canonicalAssetId);
    if (denied) return denied;

    const bytes = Buffer.from(await photo.arrayBuffer());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.MOTIL_METER_VISION_MODEL || 'gpt-4o-mini',
          max_output_tokens: 180,
          input: [{ role: 'user', content: [
            { type: 'input_text', text: 'Lee exclusivamente el contador de HORAS acumuladas visible en el horómetro de esta máquina. No confundas horas con RPM, temperatura, velocidad, voltaje, kilometraje ni códigos. Si hay ambigüedad, reflejos, múltiples lecturas o ninguna lectura clara, responde meter_hours:null. Devuelve SOLO JSON {"meter_hours":number|null,"confidence":"high"|"medium"|"low","reason":string}. Sin estimaciones.' },
            { type: 'input_image', image_url: `data:${photo.type};base64,${bytes.toString('base64')}` },
          ] }],
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return NextResponse.json({ error: 'No se pudo leer la foto. Ingresa las horas manualmente.' }, { status: 502 });
    const output = await response.json();
    const raw = (output.output || []).flatMap((entry: any) => entry.content || [])
      .filter((part: any) => part.type === 'output_text').map((part: any) => String(part.text || '')).join('').trim();
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) as Record<string, unknown>;
    const value = parsed.meter_hours;
    const meterHours = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    const confidence = ['high','medium','low'].includes(String(parsed.confidence)) ? String(parsed.confidence) : 'low';
    return NextResponse.json({
      meterHours: confidence === 'low' ? null : meterHours,
      confidence, needsConfirmation: true,
      message: meterHours === null ? 'No fue posible leer las horas con certeza.' : 'Confirma las horas antes de guardar.',
    });
  } catch {
    return NextResponse.json({ meterHours: null, needsConfirmation: true, message: 'No fue posible leer la foto. Ingresa las horas manualmente.' });
  }
}

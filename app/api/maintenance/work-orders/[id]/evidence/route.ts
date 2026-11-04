export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, getModuleAccessLevel } from '@/lib/api/module-access';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const MAX_BYTES = 20 * 1024 * 1024;
const BUCKET = 'maintenance-work-order-evidence';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const WEB_PREVIEW_TYPES = new Set(['image/heic', 'image/heif']);
async function authorize(request: NextRequest, workOrderId: string) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context;
  const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (accessLevel === 'ED') return { ...context, executionPersonId: null as string | null };
  const executionAccess = await requireAssignedMaintenanceExecution(context, workOrderId);
  if (!executionAccess.ok) return { ok: false as const, response: executionAccess.response };
  return { ...context, executionPersonId: executionAccess.personId };
}

function safeExtension(fileName: string) {
  const ext = (fileName.split('.').pop() || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? ext : '';
}

function normalizeMimeType(mimeType: string, extension: string) {
  const value = mimeType.trim().toLowerCase();
  if (value === 'image/jpg') return 'image/jpeg';
  if (ALLOWED_TYPES.has(value)) return value;
  if (!value || value === 'application/octet-stream') {
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    if (extension === 'png') return 'image/png';
    if (extension === 'webp') return 'image/webp';
    if (extension === 'heic') return 'image/heic';
    if (extension === 'heif') return 'image/heif';
  }
  return '';
}

async function requireOpenOperationalWorkOrder(
  context: Extract<Awaited<ReturnType<typeof authorize>>, { ok: true }>,
  id: string,
) {
  const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
  if (!guard.ok) {
    return { ok: false as const, response: NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status }) };
  }

  const { data: workOrder, error } = await context.supabase
    .from('maintenance_work_orders')
    .select('id,status')
    .eq('organization_id', context.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!workOrder) {
    return { ok: false as const, response: NextResponse.json({ error: 'No se encontró la orden de trabajo.' }, { status: 404 }) };
  }
  if (['completed', 'closed', 'cancelled', 'canceled'].includes(String(workOrder.status || '').toLowerCase())) {
    return { ok: false as const, response: NextResponse.json({ error: 'La OT ya no admite nueva evidencia de ejecución.' }, { status: 409 }) };
  }
  return { ok: true as const };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await authorize(request, id);
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase
    .from('work_order_evidence_files')
    .select('id,evidence_type,file_name,mime_type,size_bytes,notes,captured_at,created_at,storage_bucket,storage_path')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const evidence = await Promise.all((data || []).map(async (row) => {
    const bucket = context.supabase.storage.from(row.storage_bucket);
    const needsWebPreview = WEB_PREVIEW_TYPES.has(String(row.mime_type || '').toLowerCase());

    const [originalResult, downloadResult, previewResult, thumbnailResult] = await Promise.all([
      bucket.createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS),
      bucket.createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, { download: true }),
      needsWebPreview
        ? bucket.createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, {
            transform: { width: 1600, height: 1600, resize: 'contain', quality: 86 },
          })
        : Promise.resolve({ data: null, error: null }),
      needsWebPreview
        ? bucket.createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, {
            transform: { width: 320, height: 240, resize: 'cover', quality: 74 },
          })
        : Promise.resolve({ data: null, error: null }),
    ]);

    const originalUrl = originalResult.data?.signedUrl || null;
    const downloadUrl = downloadResult.data?.signedUrl || originalUrl;
    const previewUrl = needsWebPreview
      ? previewResult.data?.signedUrl || null
      : originalUrl;
    const thumbnailUrl = needsWebPreview
      ? thumbnailResult.data?.signedUrl || previewUrl
      : originalUrl;

    return {
      id: row.id,
      evidence_type: row.evidence_type,
      file_name: row.file_name,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      notes: row.notes,
      captured_at: row.captured_at,
      created_at: row.created_at,
      signed_url: previewUrl,
      preview_url: previewUrl,
      thumbnail_url: thumbnailUrl,
      original_url: originalUrl,
      download_url: downloadUrl,
      preview_transformed: needsWebPreview,
      preview_error: needsWebPreview && !previewUrl ? previewResult.error?.message || 'No se pudo generar vista web.' : null,
    };
  }));
  return NextResponse.json(
    {
      evidence,
      signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS,
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await authorize(request, id);
  if (!context.ok) return context.response;

  try {
    const workOrderCheck = await requireOpenOperationalWorkOrder(context, id);
    if (!workOrderCheck.ok) return workOrderCheck.response;

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      const action = String(body?.action || '');

      if (action === 'create_upload') {
        const fileName = String(body?.fileName || '').trim();
        const sizeBytes = Number(body?.sizeBytes || 0);
        const extension = safeExtension(fileName);
        const mimeType = normalizeMimeType(String(body?.mimeType || ''), extension);

        if (!fileName || !extension || !mimeType) {
          return NextResponse.json({ error: 'Formato no permitido. Usa JPG, PNG, WEBP, HEIC o HEIF.' }, { status: 400 });
        }
        if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
          return NextResponse.json({ error: 'La foto debe pesar menos de 20 MB.' }, { status: 400 });
        }

        const clientId = typeof body?.evidenceId === 'string' ? body.evidenceId : '';
        if (clientId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) return NextResponse.json({ error: 'ID de evidencia inválido' }, { status: 400 });
        const evidenceId = clientId || crypto.randomUUID();
        const { data: alreadySaved, error: existingError } = await context.supabase.from('work_order_evidence_files').select('id').eq('id', evidenceId).eq('organization_id', context.organizationId).eq('work_order_id', id).maybeSingle();
        if (existingError) throw existingError;
        if (alreadySaved) return NextResponse.json({ alreadyCompleted: true, evidenceId });
        const storagePath = `${context.organizationId}/${id}/${evidenceId}.${extension}`;
        const { data: signed, error: signedError } = await context.supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(storagePath);
        if (signedError || !signed?.token) throw signedError || new Error('No se pudo preparar la subida de la foto.');

        return NextResponse.json({
          upload: {
            evidenceId,
            storagePath,
            token: signed.token,
            signedUrl: signed.signedUrl,
            mimeType,
            fileName,
            sizeBytes,
          },
        });
      }

      if (action === 'complete_upload') {
        const evidenceId = String(body?.evidenceId || '').trim();
        const storagePath = String(body?.storagePath || '').trim();
        const fileName = String(body?.fileName || '').trim();
        const sizeBytes = Number(body?.sizeBytes || 0);
        const extension = safeExtension(fileName);
        const mimeType = normalizeMimeType(String(body?.mimeType || ''), extension);
        const notes = String(body?.notes || '').trim() || null;
        const capturedAt = typeof body?.capturedAt === 'string' ? body.capturedAt : null;
        const capturedMs = capturedAt ? Date.parse(capturedAt) : NaN;
        if (capturedAt && (!Number.isFinite(capturedMs) || capturedMs > Date.now() + 5 * 60000 || capturedMs < Date.now() - 30 * 86400000)) {
          return NextResponse.json({ error: 'Fecha de fotografía fuera de rango; requiere revisión.' }, { status: 409 });
        }
        const expectedPrefix = `${context.organizationId}/${id}/`;

        if (!/^[0-9a-f-]{36}$/i.test(evidenceId) || !storagePath.startsWith(expectedPrefix) || !storagePath.includes(evidenceId)) {
          return NextResponse.json({ error: 'La evidencia no coincide con esta OT.' }, { status: 400 });
        }
        if (!fileName || !extension || !mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
          return NextResponse.json({ error: 'Los datos de la foto no son válidos.' }, { status: 400 });
        }

        const folder = `${context.organizationId}/${id}`;
        const objectName = storagePath.slice(folder.length + 1);
        const { data: objects, error: listError } = await context.supabase.storage
          .from(BUCKET)
          .list(folder, { search: objectName, limit: 10 });
        if (listError) throw listError;
        if (!(objects || []).some((object) => object.name === objectName)) {
          return NextResponse.json({ error: 'La foto no terminó de subir. Intenta nuevamente.' }, { status: 409 });
        }

        const { data: recorded } = await context.supabase.from('work_order_evidence_files').select('id').eq('id', evidenceId).eq('organization_id', context.organizationId).eq('work_order_id', id).maybeSingle();
        if (recorded) return NextResponse.json({ evidence: recorded, duplicate: true });
        const { data, error } = await context.supabase
          .from('work_order_evidence_files')
          .insert({
            id: evidenceId,
            organization_id: context.organizationId,
            work_order_id: id,
            evidence_type: 'photo',
            storage_bucket: BUCKET,
            storage_path: storagePath,
            file_name: fileName,
            mime_type: mimeType,
            size_bytes: sizeBytes,
            notes,
            captured_at: capturedAt || new Date().toISOString(),
            created_by: context.userId,
          })
          .select('id,evidence_type,file_name,mime_type,size_bytes,notes,captured_at,created_at')
          .single();

        if (error) {
          if (error.code === '23505') return NextResponse.json({ evidence: { id: evidenceId }, duplicate: true });
          throw error;
        }

        await context.supabase.from('work_order_events').insert({
          organization_id: context.organizationId,
          work_order_id: id,
          event_type: 'execution_evidence_added',
          event_at: new Date().toISOString(),
          actor_id: context.userId,
          actor_name: context.userName || context.userEmail || null,
          source_table: 'public.work_order_evidence_files',
          source_record_id: evidenceId,
          summary: 'Evidencia fotográfica de ejecución agregada',
          payload: { evidence_id: evidenceId, mime_type: mimeType, size_bytes: sizeBytes, upload_path: 'signed_direct' },
        });

        return NextResponse.json({ evidence: data }, { status: 201 });
      }

      return NextResponse.json({ error: 'Acción de evidencia no válida.' }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const notes = String(form.get('notes') || '').trim() || null;
    if (!(file instanceof File)) return NextResponse.json({ error: 'Selecciona una foto como evidencia.' }, { status: 400 });

    const extension = safeExtension(file.name);
    const mimeType = normalizeMimeType(file.type, extension);
    if (!extension || !mimeType) return NextResponse.json({ error: 'Formato no permitido. Usa JPG, PNG, WEBP, HEIC o HEIF.' }, { status: 400 });
    if (file.size <= 0 || file.size > 12 * 1024 * 1024) return NextResponse.json({ error: 'Para fotos grandes usa la subida directa desde la pantalla de cierre.' }, { status: 400 });

    const evidenceId = crypto.randomUUID();
    const storagePath = `${context.organizationId}/${id}/${evidenceId}.${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const bucket = context.supabase.storage.from(BUCKET);
    const { error: uploadError } = await bucket.upload(storagePath, bytes, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data, error } = await context.supabase
      .from('work_order_evidence_files')
      .insert({
        id: evidenceId,
        organization_id: context.organizationId,
        work_order_id: id,
        evidence_type: 'photo',
        storage_bucket: BUCKET,
        storage_path: storagePath,
        file_name: file.name || `evidence-${evidenceId}.${extension}`,
        mime_type: mimeType,
        size_bytes: file.size,
        notes,
        captured_at: new Date().toISOString(),
        created_by: context.userId,
      })
      .select('id,evidence_type,file_name,mime_type,size_bytes,notes,captured_at,created_at')
      .single();

    if (error) {
      await bucket.remove([storagePath]);
      throw error;
    }

    await context.supabase.from('work_order_events').insert({
      organization_id: context.organizationId,
      work_order_id: id,
      event_type: 'execution_evidence_added',
      event_at: new Date().toISOString(),
      actor_id: context.userId,
      actor_name: context.userName || context.userEmail || null,
      source_table: 'public.work_order_evidence_files',
      source_record_id: evidenceId,
      summary: 'Evidencia fotográfica de ejecución agregada',
      payload: { evidence_id: evidenceId, mime_type: mimeType, size_bytes: file.size, upload_path: 'server_fallback' },
    });

    return NextResponse.json({ evidence: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo guardar la evidencia.' }, { status: 500 });
  }
}

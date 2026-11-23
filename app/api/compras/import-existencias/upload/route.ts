export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { handleUpload } from '@vercel/blob/client';
import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/guard';

const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized || !auth.user) return auth.response!;

    // Mint a short-lived, scoped client upload token. Never return the raw
    // account-level BLOB_READ_WRITE_TOKEN to a browser.
    const body = (await request.json()) as Parameters<typeof handleUpload>[0]['body'];
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Falta BLOB_READ_WRITE_TOKEN en el entorno' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const result = (await handleUpload({
      request,
      body,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (!pathname) {
          throw new Error('No se pudo definir el nombre del archivo');
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE_BYTES,
          validUntil: Date.now() + 60 * 60 * 1000,
          addRandomSuffix: true,
          allowOverwrite: true,
          cacheControlMaxAge: 60,
          tokenPayload: JSON.stringify({
            organizationId: auth.organizationId,
            userId: auth.user.id,
            clientPayload,
            multipart,
          }),
        };
      },
    })) as {
      type: 'blob.generate-client-token' | 'blob.upload-completed';
      clientToken?: string;
      response?: 'ok';
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('[v0] import-existencias upload error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'No se pudo preparar la subida del archivo' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
    );
  }
}

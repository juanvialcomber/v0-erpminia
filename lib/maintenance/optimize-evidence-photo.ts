const DEFAULT_MAX_EDGE = 1920;
const DEFAULT_QUALITY = 0.82;
const MIN_OPTIMIZE_BYTES = 1024 * 1024;

export type OptimizedEvidencePhoto = {
  file: File;
  originalBytes: number;
  optimizedBytes: number;
  optimized: boolean;
};

function jpgName(name: string) {
  const base = String(name || 'foto').replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-');
  return `${base || 'foto'}.jpg`;
}

async function decodeImage(file: File) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

export async function optimizeEvidencePhoto(
  file: File,
  options: { maxEdge?: number; quality?: number } = {},
): Promise<OptimizedEvidencePhoto> {
  const originalBytes = file.size;
  const type = String(file.type || '').toLowerCase();

  if (
    originalBytes < MIN_OPTIMIZE_BYTES ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(type) ||
    typeof createImageBitmap !== 'function'
  ) {
    return { file, originalBytes, optimizedBytes: originalBytes, optimized: false };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decodeImage(file);
    const maxEdge = options.maxEdge || DEFAULT_MAX_EDGE;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return { file, originalBytes, optimizedBytes: originalBytes, optimized: false };

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', options.quality || DEFAULT_QUALITY);
    });
    if (!blob || !blob.size || blob.size >= originalBytes) {
      return { file, originalBytes, optimizedBytes: originalBytes, optimized: false };
    }

    const optimizedFile = new File([blob], jpgName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });

    return {
      file: optimizedFile,
      originalBytes,
      optimizedBytes: optimizedFile.size,
      optimized: true,
    };
  } catch {
    return { file, originalBytes, optimizedBytes: originalBytes, optimized: false };
  } finally {
    bitmap?.close();
  }
}

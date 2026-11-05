'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { AlertCircle, CheckCircle2, FileUp, Loader2, UploadCloud, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

type QueueStatus = 'ready' | 'hashing' | 'uploading' | 'done' | 'duplicate' | 'error';

type QueueItem = {
  id: string;
  file: File;
  relativePath: string;
  status: QueueStatus;
  message?: string;
};

const sourceOptions = [
  { value: 'windows_server', label: 'Windows Server' },
  { value: 'laudus', label: 'Laudus' },
  { value: 'area_upload', label: 'Carpeta de área' },
  { value: 'manual_upload', label: 'Carga manual' },
  { value: 'other', label: 'Otra fuente' },
];

const areaOptions = [
  'general',
  'operaciones',
  'mantenimiento',
  'bodega',
  'administracion',
  'finanzas',
  'geologia',
  'hse',
  'compras',
  'rrhh',
];

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la ingesta documental.');
  return payload;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function sha256File(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export default function DocumentIntakePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [source, setSource] = useState('windows_server');
  const [area, setArea] = useState('general');
  const [sourcePath, setSourcePath] = useState('');
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { data, mutate } = useSWR('/api/documents/intake', fetcher, { revalidateOnFocus: false });

  const pendingCount = useMemo(() => queue.filter((item) => item.status === 'ready' || item.status === 'error').length, [queue]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    const accepted = incoming.filter((file) => file.size > 0 && file.size <= 50 * 1024 * 1024);
    setQueue((current) => {
      const keys = new Set(current.map((item) => `${item.relativePath}:${item.file.size}:${item.file.lastModified}`));
      const next = accepted
        .map((file) => {
          const relativePath = file.webkitRelativePath || file.name;
          return { file, relativePath };
        })
        .filter(({ file, relativePath }) => !keys.has(`${relativePath}:${file.size}:${file.lastModified}`))
        .map(({ file, relativePath }) => ({ id: crypto.randomUUID(), file, relativePath, status: 'ready' as const }));
      return [...current, ...next];
    });
  }, []);

  const patchItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const uploadOne = async (item: QueueItem) => {
    try {
      patchItem(item.id, { status: 'hashing', message: 'Calculando hash…' });
      const sha256 = await sha256File(item.file);

      const relativeDirectory = item.relativePath.includes('/')
        ? item.relativePath.split('/').slice(0, -1).join('/')
        : '';
      const effectiveSourcePath = [sourcePath.trim(), relativeDirectory].filter(Boolean).join('/');

      const prepareResponse = await fetch('/api/documents/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'prepare',
          originalName: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          fileSize: item.file.size,
          sha256,
          source,
          area,
          sourcePath: effectiveSourcePath,
        }),
      });
      const prepared = await prepareResponse.json().catch(() => null);

      if (prepareResponse.status === 409 && prepared?.duplicate) {
        patchItem(item.id, { status: 'duplicate', message: 'Ya existe con el mismo hash.' });
        return;
      }

      if (!prepareResponse.ok) {
        throw new Error(prepared?.error || 'No fue posible preparar la carga.');
      }

      patchItem(item.id, { status: 'uploading', message: 'Subiendo a Supabase…' });
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(prepared.bucket)
        .uploadToSignedUrl(prepared.path, prepared.token, item.file, {
          contentType: item.file.type || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const confirmResponse = await fetch('/api/documents/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'confirm',
          path: prepared.path,
          originalName: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          fileSize: item.file.size,
          sha256,
          source,
          area,
          sourcePath: effectiveSourcePath,
        }),
      });
      const confirmed = await confirmResponse.json().catch(() => null);
      if (!confirmResponse.ok) throw new Error(confirmed?.error || 'No fue posible registrar la carga.');

      patchItem(item.id, { status: 'done', message: 'Pendiente de clasificar' });
    } catch (error) {
      patchItem(item.id, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Error de carga',
      });
    }
  };

  const startUpload = async () => {
    if (running) return;
    setRunning(true);
    const candidates = queue.filter((item) => item.status === 'ready' || item.status === 'error');
    for (const item of candidates) {
      await uploadOne(item);
    }
    setRunning(false);
    await mutate();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Documentación</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Ingesta documental</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Recibe originales desde el Windows Server, Laudus o las áreas. Los archivos entran a una bandeja privada antes de clasificarse y vincularse a MOTIL.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/documentos-gestion">Volver a control documental</Link>
        </Button>
      </header>

      <div className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3">
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Recibidos</p><p className="mt-1 text-2xl font-semibold">{data?.stats?.total || 0}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Por clasificar</p><p className="mt-1 text-2xl font-semibold">{data?.stats?.pending || 0}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Procesados</p><p className="mt-1 text-2xl font-semibold">{data?.stats?.processed || 0}</p></div>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm font-medium">
              <span>Fuente</span>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={source} onChange={(event) => setSource(event.target.value)} disabled={running}>
                {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Área</span>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={area} onChange={(event) => setArea(event.target.value)} disabled={running}>
                {areaOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Ruta de origen <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} placeholder="Ej: Mantenimiento/2026/OT" disabled={running} />
            </label>
          </div>

          <div
            className="rounded-lg border border-dashed p-8 text-center transition-colors hover:bg-muted/30"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addFiles(event.dataTransfer.files);
            }}
          >
            <UploadCloud className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-3 font-medium">Arrastra documentos aquí</p>
            <p className="mt-1 text-sm text-muted-foreground">También puedes seleccionar una carpeta completa y conservar su estructura. Máximo 50 MB por archivo.</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => event.target.files && addFiles(event.target.files)} />
            <input
              ref={(node) => {
                folderInputRef.current = node;
                if (node) {
                  node.setAttribute('webkitdirectory', '');
                  node.setAttribute('directory', '');
                }
              }}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => event.target.files && addFiles(event.target.files)}
            />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={running}>
                <FileUp className="mr-2 h-4 w-4" />Seleccionar archivos
              </Button>
              <Button type="button" onClick={() => folderInputRef.current?.click()} disabled={running}>
                <UploadCloud className="mr-2 h-4 w-4" />Seleccionar carpeta
              </Button>
            </div>
          </div>

          {queue.length > 0 && (
            <div className="divide-y rounded-lg border">
              {queue.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.file.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.relativePath !== item.file.name ? `${item.relativePath} · ` : ''}{formatBytes(item.file.size)}{item.message ? ` · ${item.message}` : ''}</p>
                  </div>
                  {item.status === 'hashing' || item.status === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                  {item.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                  {item.status === 'duplicate' ? <Badge variant="outline">Duplicado</Badge> : null}
                  {item.status === 'error' ? <AlertCircle className="h-4 w-4 text-destructive" /> : null}
                  {item.status === 'ready' && !running ? (
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setQueue((current) => current.filter((queued) => queued.id !== item.id))} aria-label={`Quitar ${item.file.name}`}>
                      <XCircle className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Cada archivo se registra con hash SHA-256, fuente, área, ruta de origen y estado de clasificación.
            </p>
            <Button onClick={startUpload} disabled={running || pendingCount === 0}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {running ? 'Subiendo…' : `Subir ${pendingCount || ''} documento${pendingCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Recepciones recientes</h2>
          <p className="text-sm text-muted-foreground">Últimos archivos registrados en la bandeja de ingesta.</p>
        </div>
        <div className="divide-y rounded-lg border">
          {(data?.items || []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Todavía no hay documentos recibidos.</p>
          ) : (
            (data?.items || []).slice(0, 12).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.original_name}</p>
                  <p className="text-xs text-muted-foreground">{item.source} · {item.area || 'general'} · {formatBytes(Number(item.file_size_bytes || 0))}</p>
                </div>
                <Badge variant={item.status === 'pending_classification' ? 'outline' : 'secondary'}>
                  {item.status === 'pending_classification' ? 'Por clasificar' : item.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

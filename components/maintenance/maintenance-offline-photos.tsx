'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { optimizeEvidencePhoto } from '@/lib/maintenance/optimize-evidence-photo';

type LocalPhoto = { id: string; workOrderId: string; scope: string; file: Blob; fileName: string; mimeType: string; capturedAt: string };
const DB = 'motil-maintenance-photos-v1';
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', mode);
      const req = operation(tx.objectStore('photos'));
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve(req.result);
    });
  } finally { db.close(); }
}
const list = () => transact<LocalPhoto[]>('readonly', (store) => store.getAll());
const save = (photo: LocalPhoto) => transact('readwrite', (store) => store.put(photo));
const remove = (id: string) => transact('readwrite', (store) => store.delete(id));

export function MaintenanceOfflinePhotos({ workOrderId, offlineScope }: { workOrderId: string; offlineScope: string }) {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [online, setOnline] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setOnline(navigator.onLine);
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed); };
  }, []);
  useEffect(() => {
    let active = true;
    void list().then((all) => { if (active) setPhotos(all.filter((p) => p.workOrderId === workOrderId && p.scope === offlineScope)); }).catch(() => setMessage('El dispositivo no permite almacenar fotos offline.'));
    return () => { active = false; };
  }, [workOrderId, offlineScope]);

  async function capture(files: FileList | null) {
    if (!files?.length) return;
    setWorking(true);
    try {
      for (const sourceFile of Array.from(files)) {
        if (!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(sourceFile.type) || sourceFile.size > 20 * 1024 * 1024 || !sourceFile.size) throw new Error('Fotografía no válida. Máximo 20 MB por imagen.');
        const optimized = await optimizeEvidencePhoto(sourceFile);
        const file = optimized.file;
        const photo: LocalPhoto = { id: crypto.randomUUID(), workOrderId, scope: offlineScope, file, fileName: file.name, mimeType: file.type, capturedAt: new Date().toISOString() };
        await save(photo);
        setPhotos((previous) => [...previous, photo]);
      }
      setMessage('Fotos optimizadas y guardadas en este dispositivo, pendientes de sincronizar.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudieron conservar las fotografías.'); }
    finally { setWorking(false); }
  }

  async function syncPhotos() {
    if (!online || working || !photos.length) return;
    setWorking(true);
    try {
      const supabase = createClient();
      for (const photo of photos) {
        const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/evidence`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create_upload', evidenceId: photo.id, fileName: photo.fileName, mimeType: photo.mimeType, sizeBytes: photo.file.size }),
        });
        const prepared = await response.json().catch(() => null);
        if (!response.ok) throw new Error(prepared?.error || 'No se pudo preparar la fotografía.');
        if (!prepared.alreadyCompleted) {
          const upload = prepared.upload;
          if (!upload?.storagePath || !upload?.token) throw new Error('Respuesta de subida incompleta.');
          const { error } = await supabase.storage.from('maintenance-work-order-evidence').uploadToSignedUrl(upload.storagePath, upload.token, photo.file, { contentType: photo.mimeType });
          if (error && !/already exists|duplicate/i.test(error.message)) throw error;
          const result = await fetch(`/api/maintenance/work-orders/${workOrderId}/evidence`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'complete_upload', evidenceId: photo.id, storagePath: upload.storagePath, fileName: photo.fileName, mimeType: photo.mimeType, sizeBytes: photo.file.size, capturedAt: photo.capturedAt }),
          });
          if (!result.ok) throw new Error((await result.json().catch(() => null))?.error || 'No se confirmó la evidencia.');
        }
        await remove(photo.id);
        setPhotos((previous) => previous.filter((entry) => entry.id !== photo.id));
      }
      setMessage('Fotografías sincronizadas correctamente.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Fotos pendientes: vuelve a intentar cuando tengas señal.'); }
    finally { setWorking(false); }
  }
  // Keep uploads explicit on shared devices: connectivity alone does not authorize
  // an automatic transfer of field photographs.
  useEffect(() => {
    if (!online || !photos.length) return;
    setMessage((previous) => previous || 'Hay fotografías locales listas para sincronizar.');
  }, [online, photos.length]);

  return <section className="space-y-3 rounded-lg border p-4" aria-label="Fotos offline">
    <p className="text-sm font-semibold">Fotografías sin conexión</p>
    <p className="text-xs text-muted-foreground">Las fotos permanecen en este dispositivo hasta que el servidor confirme su recepción. Mantén abierta la OT si estás sin señal. No desinstales MOTIL ni borres los datos del navegador mientras estén pendientes.</p>
    <label className="block text-sm">Agregar fotografías para sincronizar
      <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple capture="environment" disabled={working} className="mt-2 block w-full text-sm" onChange={(event) => { void capture(event.target.files); event.target.value = ''; }} />
    </label>
    <p className="text-xs">{photos.length} fotografía(s) pendiente(s) · {online ? 'Con conexión' : 'Sin conexión'}</p>
    <Button size="sm" variant="outline" disabled={!online || working || !photos.length} onClick={() => void syncPhotos()}>{working ? 'Procesando…' : 'Sincronizar fotografías'}</Button>
    {message ? <p className="text-xs" role="status">{message}</p> : null}
  </section>;
}

'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Message = {
  message_id: number; group_name: string; sender_name: string | null;
  message_type: string; body: string | null; occurred_at: string; received_at: string;
  activity_count: number; published_count: number; exception_count: number;
  attachment_count: number; stored_attachment_count: number;
  extracted_attachment_count: number; problematic_attachment_count: number;
  registry_state: string;
};

export function WhatsappSourceRegistry() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limited, setLimited] = useState(false);
  async function reload() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/whatsapp/registry', { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || !Array.isArray(payload.messages))
        throw new Error(payload?.error || 'No se pudo consultar el registro de mensajes');
      setMessages(payload.messages); setLimited(Boolean(payload.limited));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar mensajes');
    } finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  return <section className="space-y-3" aria-labelledby="whatsapp-registry-heading">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 id="whatsapp-registry-heading" className="text-lg font-semibold">Todos los mensajes recibidos</h2>
        <p className="text-sm text-muted-foreground">El mensaje original se muestra aunque su análisis o publicación estén pendientes. Los grupos desactivados no aparecen.</p>
      </div>
      <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>{loading ? 'Consultando…' : 'Actualizar'}</Button>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Consultando mensajes…</p> : null}
    {!loading && !error && messages.length === 0 ? <p className="text-sm text-muted-foreground">No hay mensajes registrados para los grupos habilitados.</p> : null}
    {!loading && !error ? <div className="space-y-2">
      {messages.map(m => {
        const processed = Number(m.activity_count || 0) > 0;
        const published = Number(m.published_count || 0) > 0;
        const problems = Number(m.exception_count || 0) + Number(m.problematic_attachment_count || 0);
        const originalTime = new Date(m.occurred_at);
        const receivedTime = new Date(m.received_at);
        return <article key={m.message_id} className="rounded-lg border p-3 text-sm space-y-2">
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{m.group_name}</strong>
            <span className="text-muted-foreground">{originalTime.toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</span>
          </div>
          <p className="whitespace-pre-wrap break-words">{m.body?.trim() || (m.attachment_count ? 'Mensaje con archivos adjuntos' : 'Mensaje sin texto')}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Recibido: {receivedTime.toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</span>
            <span>Procesamiento: {processed ? 'Con actividad' : 'Sin actividad registrada'}</span>
            <span>Publicación: {published ? 'Publicada' : 'No publicada'}</span>
            <span>Archivos: {m.stored_attachment_count || 0}/{m.attachment_count || 0} almacenados</span>
            {problems > 0 ? <span className="text-destructive">Excepciones: {problems}</span> : null}
          </div>
        </article>;
      })}
      {limited ? <p className="text-xs text-muted-foreground">Mostrando los 80 mensajes más recientes de grupos habilitados.</p> : null}
    </div> : null}
  </section>;
}

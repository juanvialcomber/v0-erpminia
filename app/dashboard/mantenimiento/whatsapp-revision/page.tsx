'use client';

import { useState } from 'react';
import useSWR from 'swr';

type ReviewItem = {
  item_index: number;
  source_excerpt: string;
  event_time_kind: string;
  suggested_destinations: string[];
  existing_activity?: boolean;
};
type SourceMessage = {
  message_id: number;
  sender_name: string | null;
  sender_chat_id: string | null;
  group_name: string | null;
  received_at: string;
  registry_state: string;
  problematic_attachment_count: number;
  review_items: ReviewItem[];
};
const temporalLabels: Record<string, string> = {
  completed: 'Trabajo realizado',
  planned: 'Trabajo planificado',
  status_report: 'Estado reportado',
  unknown: 'Sin clasificación temporal',
};
const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo cargar la revisión de WhatsApp');
  return response.json();
};

export default function WhatsappReviewPage() {
  const { data, error, isLoading } = useSWR('/api/maintenance/whatsapp/review-queue', fetcher, { refreshInterval: 60000 });
  const [expanded, setExpanded] = useState<number | null>(null);
  const messages: SourceMessage[] = data?.items || [];
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-5">
      <div>
        <h1 className="text-2xl font-semibold">Revisión de WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Mensajes originales, remitentes y destinos sugeridos. Solo lectura: ninguna actividad se publica desde esta pantalla.</p>
      </div>
      {isLoading && <p role="status">Cargando mensajes…</p>}
      {error && <p role="alert">No fue posible obtener los mensajes. Inténtalo nuevamente.</p>}
      {!isLoading && !error && messages.length === 0 && <p>No hay mensajes disponibles para revisión.</p>}
      <div className="space-y-3">
        {messages.map((message) => (
          <section key={message.message_id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{message.sender_name || 'Remitente sin nombre'} · {message.group_name || 'Grupo sin identificar'}</h2>
                <p className="text-xs text-muted-foreground">Mensaje {message.message_id} · {new Date(message.received_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>
                <p className="text-xs text-muted-foreground">Estado de origen: {message.registry_state} · {message.review_items.length} secciones · {message.problematic_attachment_count || 0} adjuntos con problemas</p>
              </div>
              <button type="button" aria-expanded={expanded === message.message_id} onClick={() => setExpanded(expanded === message.message_id ? null : message.message_id)} className="rounded-md border px-3 py-2 text-sm">
                {expanded === message.message_id ? 'Ocultar' : 'Revisar'}
              </button>
            </div>
            {expanded === message.message_id && (
              <div className="mt-4 space-y-3 border-t pt-4">
                {message.review_items.length === 0 && <p className="text-sm text-muted-foreground">Sin texto extraíble. Requiere revisar el adjunto original.</p>}
                {message.review_items.map((item) => (
                  <article key={item.item_index} className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Sección {item.item_index + 1} · {temporalLabels[item.event_time_kind] || 'Por revisar'} · Destinos sugeridos: {item.suggested_destinations.join(', ') || 'Sin determinar'}</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.source_excerpt}</p>
                    <p className="mt-2 text-xs font-medium">{item.existing_activity ? 'Actividad con índice coincidente: verificar antes de duplicar' : 'Pendiente de validación · No publicado'}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}

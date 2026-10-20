'use client';

import useSWR from 'swr';
import { WhatsappTriageInbox } from '@/components/whatsapp/whatsapp-triage-inbox';
import { StatePanel } from '@/components/ui/state-panel';
import { Button } from '@/components/ui/button';

type Report = { report_date: string };
type Response = { reports?: Report[]; whatsappReviewEnabled?: boolean; error?: string };

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar WhatsApp IA.');
  return payload as Response;
};

export default function WhatsappIaPage() {
  const { data, error, isLoading, mutate } = useSWR<Response>('/api/admin/whatsapp', fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <main className="space-y-5">
      <header className="border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mantenimiento</p>
        <h1 className="mt-1 text-2xl font-semibold">WhatsApp IA</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Mensajes operacionales primero. La IA ordena, clasifica y relaciona evidencia; la decisión humana queda en Aprobar o Rechazar.
        </p>
      </header>

      {isLoading ? <StatePanel tone="loading" title="Cargando mensajes de WhatsApp…" className="min-h-40" /> : null}
      {error ? <StatePanel tone="error" title="WhatsApp IA no disponible" description={error.message}
        actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} className="min-h-0" /> : null}
      {!isLoading && !error && !data?.whatsappReviewEnabled ? (
        <StatePanel tone="neutral" title="Revisión IA pendiente de habilitación"
          description="La evidencia permanece guardada y no modifica datos canónicos." className="min-h-0" />
      ) : null}
      {!isLoading && !error && data?.whatsappReviewEnabled ? (
        <WhatsappTriageInbox dates={(data.reports || []).map((report) => report.report_date)} />
      ) : null}
    </main>
  );
}

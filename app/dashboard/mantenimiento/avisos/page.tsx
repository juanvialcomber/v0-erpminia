'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, BellRing, Eye, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

type Notice = {
  id: string;
  source: 'operational_review' | 'condition_signal' | 'meter_review';
  state: 'evaluate' | 'monitor' | 'ready_for_work_order';
  priority: 'high' | 'normal';
  title: string;
  detail: string;
  evidence: string;
  canonicalAssetId: string | null;
  occurredAt: string | null;
  href: string;
};

type Payload = {
  summary: { total: number; evaluate: number; monitor: number; readyForWorkOrder: number; highPriority: number };
  notices: Notice[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar los avisos técnicos.');
  return payload;
};

const stateLabel = (state: Notice['state']) => state === 'evaluate'
  ? 'Por evaluar'
  : state === 'monitor'
    ? 'Seguir mirando'
    : 'Listo para OT';

const sourceLabel = (source: Notice['source']) => source === 'operational_review'
  ? 'Operación'
  : source === 'condition_signal'
    ? 'Condición'
    : 'Horómetro';

export default function TechnicalNoticesPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/maintenance/technical-notices', fetcher, { revalidateOnFocus: false });
  const notices = data?.notices || [];

  return <div className="mx-auto w-full max-w-[1500px] space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Mantenimiento · evidencia previa a OT</PageHeaderEyebrow>
        <PageHeaderTitle>Avisos técnicos</PageHeaderTitle>
        <PageHeaderDescription>Una sola bandeja para decidir si una señal se descarta, se sigue observando o ya merece trabajo. Un aviso no cambia el equipo ni crea una OT automáticamente.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        <Button variant="outline" onClick={() => void mutate()}>Actualizar</Button>
      </PageHeaderActions>
    </PageHeader>

    <section aria-label="Resumen avisos técnicos" className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-5">
      {[
        ['Total', data?.summary.total ?? '—', 'Señales activas'],
        ['Por evaluar', data?.summary.evaluate ?? '—', 'Requieren decisión'],
        ['Seguir mirando', data?.summary.monitor ?? '—', 'Sin OT todavía'],
        ['Listo para OT', data?.summary.readyForWorkOrder ?? '—', 'Señal confirmada'],
        ['Alta prioridad', data?.summary.highPriority ?? '—', 'Revisión primero'],
      ].map(([label, value, detail]) => <div key={String(label)} className="bg-card p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{isLoading ? '—' : value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>)}
    </section>

    {error ? <StatePanel tone="error" title="No se pudieron cargar los avisos" description={error.message} className="min-h-0 py-5" /> : null}

    {!isLoading && !error && notices.length === 0 ? <StatePanel
      tone="neutral"
      title="Sin avisos técnicos activos"
      description="No significa que todos los equipos estén sanos. Significa que las fuentes actuales no tienen una señal pendiente, monitorizada o confirmada que requiera decisión."
      className="min-h-0 py-8"
    /> : null}

    {notices.length > 0 ? <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-lg">Qué requiere atención</CardTitle>
        <CardDescription>Prioridad primero. Cada aviso vuelve a su flujo original para resolverlo y mantener trazabilidad.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {notices.map((notice) => <div key={notice.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {notice.priority === 'high' ? <AlertTriangle className="h-4 w-4 text-destructive" /> : notice.state === 'monitor' ? <Eye className="h-4 w-4 text-muted-foreground" /> : <BellRing className="h-4 w-4 text-muted-foreground" />}
                <Badge variant={notice.priority === 'high' ? 'destructive' : 'outline'}>{stateLabel(notice.state)}</Badge>
                <Badge variant="outline">{sourceLabel(notice.source)}</Badge>
              </div>
              <p className="mt-2 font-medium">{notice.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{notice.detail}</p>
              <p className="mt-2 text-xs text-muted-foreground">Evidencia: {notice.evidence}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {notice.canonicalAssetId ? <Button asChild size="sm" variant="outline"><Link href={`/dashboard/mantenimiento/equipos/${notice.canonicalAssetId}/ficha`}>Ver activo</Link></Button> : null}
              <Button asChild size="sm"><Link href={notice.href}>{notice.state === 'ready_for_work_order' ? <Wrench className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}Resolver</Link></Button>
            </div>
          </div>)}
        </div>
      </CardContent>
    </Card> : null}

    <div className="rounded-lg border px-4 py-3 text-xs leading-5 text-muted-foreground">
      Modelo: evidencia → aviso → decisión humana → OT cuando corresponde. No existe auto-diagnóstico, auto-priorización irreversible ni creación automática de trabajo.
    </div>
  </div>;
}

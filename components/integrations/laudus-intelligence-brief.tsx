'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, BrainCircuit, CircleAlert, CircleCheck, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Signal = {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  summary: string;
  metric: string;
  action: string;
  evidence: string[];
  href: string;
};

type Payload = {
  source: 'Laudus';
  product: 'MOTIL Intelligence';
  readOnly: true;
  generatedAt: string;
  freshness: {
    purchaseOrdersLatest: string | null;
    invoicesLatest: string | null;
  };
  signals: Signal[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible construir la inteligencia Laudus.');
  return payload;
};

const date = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(value))
    : '—';

const icon = {
  high: CircleAlert,
  medium: CircleAlert,
  info: Info,
};

const badgeLabel = {
  high: 'Prioridad alta',
  medium: 'Revisar',
  info: 'Contexto',
};

export function LaudusIntelligenceBrief({ compact = false }: { compact?: boolean }) {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/intelligence/laudus-brief?days=365',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (isLoading) {
    return <StatePanel tone="loading" title="MOTIL está interpretando Laudus" description="Cruzando compras, facturas, proveedores, stock y mantenimiento." />;
  }

  if (error) {
    return <StatePanel tone="warning" title="Inteligencia Laudus no disponible" description="Los módulos siguen disponibles; MOTIL no reemplaza datos faltantes por supuestos." />;
  }

  const signals = (data?.signals || []).slice(0, compact ? 3 : 5);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">MOTIL Intelligence</p>
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Qué está diciendo Laudus</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            MOTIL transforma registros ERP en excepciones, contexto y siguientes decisiones. Laudus sigue siendo la fuente financiera; MOTIL interpreta y prioriza.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">OC {date(data?.freshness.purchaseOrdersLatest)}</Badge>
          <Badge variant="outline">Facturas {date(data?.freshness.invoicesLatest)}</Badge>
        </div>
      </div>

      {signals.length ? (
        <div className="divide-y">
          {signals.map((signal) => {
            const Icon = icon[signal.severity];
            return (
              <div key={signal.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{signal.title}</h3>
                    <Badge variant={signal.severity === 'high' ? 'destructive' : 'outline'}>{badgeLabel[signal.severity]}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{signal.summary}</p>
                  {!compact ? (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {signal.evidence.map((item) => <span key={item}>• {item}</span>)}
                    </div>
                  ) : null}
                  <p className="mt-3 text-sm"><span className="font-medium">Siguiente decisión:</span> {signal.action}</p>
                </div>
                <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
                  <p className="text-lg font-semibold tracking-tight">{signal.metric}</p>
                  <Link href={signal.href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    Revisar <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-start gap-3 p-5">
          <CircleCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Sin señales materiales con la evidencia disponible</p>
            <p className="mt-1 text-xs text-muted-foreground">Esto no acredita ausencia de riesgo; indica que las reglas actuales no priorizan una revisión inmediata.</p>
          </div>
        </div>
      )}

      <div className="border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
        Lectura solamente · no aprueba pagos · no crea compras · no modifica Laudus.
      </div>
    </section>
  );
}

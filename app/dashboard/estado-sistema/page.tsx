'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { SectionHandover } from '@/components/intake/section-handover';
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Check = { id: string; label: string; status: 'ok' | 'warning' | 'error'; detail: string; href?: string };
type ResponseData = {
  status?: 'ready' | 'ready_with_observations' | 'blocked';
  summary?: { total?: number; ok?: number; warnings?: number; errors?: number };
  checks?: Check[];
  generatedAt?: string;
};

const fetcher = async (url: string): Promise<ResponseData> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo comprobar el estado del sistema');
  return payload || {};
};

export default function EstadoSistemaPage() {
  const { data, error, isLoading, mutate } = useSWR<ResponseData>('/api/admin/readiness', fetcher, { revalidateOnFocus: false });
  const checks = Array.isArray(data?.checks) ? data.checks : [];
  const blocked = data?.status === 'blocked';

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Control de lanzamiento</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Estado del sistema</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Comprobación de acceso y fuentes operacionales reales antes de una entrega o cambio de versión.</p>
        </div>
        <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className="mr-2 h-4 w-4" /> Comprobar</Button>
      </section>

      <SectionHandover section="data_health" />

      {error ? (
        <Card className="border-destructive/30 shadow-none"><CardContent className="p-8 text-center"><XCircle className="mx-auto h-7 w-7 text-destructive" /><p className="mt-3 font-medium">No se pudo completar la comprobación</p><Button className="mt-4" variant="outline" onClick={() => void mutate()}>Reintentar</Button></CardContent></Card>
      ) : (
        <>
          <Card className="shadow-none">
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                {blocked ? <XCircle className="h-8 w-8 text-destructive" /> : data?.status === 'ready' ? <ShieldCheck className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
                <div><p className="font-semibold">{isLoading ? 'Comprobando…' : blocked ? 'Hay puntos que bloquean la salida' : data?.status === 'ready' ? 'Sistema preparado' : 'Preparado con observaciones'}</p><p className="text-sm text-muted-foreground">No se generan registros ni datos de prueba durante esta revisión.</p></div>
              </div>
              <div className="flex gap-2"><Badge variant="secondary">{Number(data?.summary?.ok || 0)} correctos</Badge><Badge variant="outline">{Number(data?.summary?.warnings || 0)} observaciones</Badge>{Number(data?.summary?.errors || 0) > 0 && <Badge variant="destructive">{Number(data?.summary?.errors || 0)} bloqueos</Badge>}</div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle className="text-lg">Comprobaciones operacionales</CardTitle></CardHeader>
            <CardContent className="p-0">
              {isLoading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div> : (
                <div className="divide-y border-t">{checks.map((check) => <div key={check.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div className="flex gap-3">{check.status === 'ok' ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : check.status === 'warning' ? <AlertTriangle className="mt-0.5 h-5 w-5" /> : <XCircle className="mt-0.5 h-5 w-5 text-destructive" />}<div><p className="font-medium">{check.label}</p><p className="mt-1 text-sm text-muted-foreground">{check.detail}</p></div></div>{check.href && <Button asChild size="sm" variant="ghost"><Link href={check.href}>Abrir <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>}</div>)}</div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

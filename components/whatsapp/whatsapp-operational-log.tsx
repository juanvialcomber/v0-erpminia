'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type OperationalRecord = {
  id: string;
  report_date: string;
  scope: 'plant' | 'dispatch' | 'general';
  category: string;
  reported_state: 'reported_done' | 'pending' | 'planned' | 'unclear';
  summary: string;
  source_message_ids: number[];
  recorded_at: string;
};

const scopeText: Record<string,string> = {
  plant: 'Planta',
  dispatch: 'Despachos',
  general: 'Operación general',
};
const stateText: Record<string,string> = {
  reported_done: 'Informado como realizado',
  pending: 'Informado pendiente',
  planned: 'Informado planificado',
  unclear: 'Estado no precisado',
};

export function WhatsappOperationalLog() {
  const [rows,setRows] = useState<OperationalRecord[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);setError('');
    try {
      const response=await fetch('/api/admin/whatsapp/operational-log',{
        credentials:'include',cache:'no-store',
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok || !Array.isArray(data?.records)) throw new Error(
        response.status===503
          ? 'La bitácora está pendiente de habilitación en este entorno.'
          :data?.error || 'No se pudo leer la bitácora.');
      setRows(data.records);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'No se pudo leer la bitácora.');
    } finally { setLoading(false); }
  }, []);

  useEffect(()=>{void reload();},[reload]);

  return <section className="space-y-3 border-t pt-5" aria-label="Bitácora de operación">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Bitácora operacional</h2>
        <p className="text-sm text-muted-foreground">
          Novedades de planta y despachos revisadas, separadas de OT de maquinaria y KPI certificados.
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={loading}
        onClick={()=>void reload()}>Actualizar</Button>
    </div>
    {loading ? <p role="status" className="text-sm text-muted-foreground">Consultando bitácora…</p>
      :error ? <p role="alert" className="rounded-md border p-3 text-sm text-muted-foreground">{error}</p>
      :rows.length===0 ? <p className="rounded-md border p-4 text-sm text-muted-foreground">
        Todavía no hay novedades incorporadas. Revisa y clasifica los hallazgos de arriba.
      </p> : <div className="divide-y rounded-md border">
        {rows.map(item=><div key={item.id} className="space-y-1 p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>{scopeText[item.scope] || 'Operación'} · {item.report_date}</span>
            <span>{stateText[item.reported_state] || 'Estado no precisado'} · {item.category.replaceAll('_',' ')}</span>
          </div>
          <p>{item.summary}</p>
          <p className="text-xs text-muted-foreground">
            {Array.isArray(item.source_message_ids) ? item.source_message_ids.length : 0}
            {' '}mensajes originales · Observación revisada, no certificación física
          </p>
        </div>)}
      </div>}
  </section>;
}

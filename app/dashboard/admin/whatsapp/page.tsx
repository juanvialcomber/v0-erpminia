'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, MessageSquare, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
type Group={id?:string;chatId?:string;chat_id?:string;name?:string;display_name?:string;enabled?:boolean;last_received_at?:string|null};
type Report={report_date:string;status:string;message_count:number;summary:string;truncated:boolean;findings:any[]};
export default function WhatsappAdminPage() {
  const [configured,setConfigured]=useState(false);
  const [groups,setGroups]=useState<Group[]>([]);
  const [discovered,setDiscovered]=useState<Group[]>([]);
  const [reports,setReports]=useState<Report[]>([]);
  const [error,setError]=useState('');
  const [historyResults,setHistoryResults]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  async function call(body?:unknown) {
    const r=await fetch('/api/admin/whatsapp',{method:body?'POST':'GET',credentials:'include',cache:'no-store',
      headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
    const j=await r.json().catch(()=>null);
    if(!j||typeof j!=='object')throw new Error(r.ok?'Respuesta inválida del servidor.':`Servicio temporalmente no disponible (HTTP ${r.status}).`);
    if(!r.ok)throw new Error(j.error||`Error de conexión (HTTP ${r.status})`);return j;
  }
  async function reload(){
    setLoading(true);setError('');
    try{const j=await call();setConfigured(j.configured);setGroups(j.groups);setReports(j.reports)}
    catch(e){setError(e instanceof Error?e.message:'No se pudo cargar');}finally{setLoading(false);}
  }
  useEffect(()=>{void reload()},[]);
  async function discover(){setBusy('discover');setError('');try{const j=await call({action:'discover'});setDiscovered(j.groups)}
    catch(e){setError(e instanceof Error?e.message:'No se pudo obtener grupos')}finally{setBusy('')}}
  async function recoverHistory(){
    setBusy('history');setError('');setHistoryResults([]);
    const results:string[]=[];
    try {
      for(const group of groups.filter(g=>g.enabled)){
        const name=group.display_name||'Grupo';
        try{
          const result=await call({action:'history',chatId:group.chat_id});
          results.push(`${name}: ${result.inserted} nuevos, ${result.existing} ya guardados, ${result.skipped} omitidos.${result.limited?' Se alcanzó el límite de 100 mensajes consultados.':''}`);
        }catch(e){results.push(`${name}: ${e instanceof Error?e.message:'Error al recuperar'}. Puedes reintentar.`)}
        setHistoryResults([...results]);
      }
    }finally{setBusy('')}
  }
  async function toggle(g:Group,enabled:boolean){
    const chatId=g.chatId||g.chat_id||'',name=g.name||g.display_name||'';
    setBusy(chatId);setError('');
    try{await call({action:'save',chatId,name,enabled});await reload();}
    catch(e){setError(e instanceof Error?e.message:'Error al guardar')}finally{setBusy('')}
  }
  return <main className="mx-auto max-w-5xl space-y-6">
    <header className="space-y-2 border-b pb-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Administración / Integraciones</p>
      <h1 className="text-2xl font-semibold">WhatsApp · Inteligencia operacional</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">Selecciona qué grupos autorizados pueden aportar evidencia a MOTIL. Los mensajes nunca modifican automáticamente órdenes de trabajo, producción o registros HSE.</p>
    </header>
    {error&&<div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/40 p-3 text-sm"><AlertCircle className="h-4 w-4"/>{error}</div>}
    {loading?<p role="status" className="text-sm text-muted-foreground">Cargando configuración…</p>:<>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Grupos autorizados</h2><p className="text-sm text-muted-foreground">{configured?'Instancia configurada. Selecciona los grupos a sincronizar.':'Faltan credenciales privadas de Green API en Vercel.'}</p></div>
          <div className="flex flex-wrap gap-2">
            {groups.some(g=>g.enabled)&&<Button onClick={()=>void recoverHistory()} disabled={!configured||Boolean(busy)}>{busy==='history'?'Recuperando…':'Recuperar mensajes'}</Button>}
            <Button variant={groups.some(g=>g.enabled)?'outline':'default'} onClick={()=>void discover()} disabled={!configured||Boolean(busy)}><RefreshCw className="mr-2 h-4 w-4"/>Buscar grupos</Button>
          </div>
        </div>
        {groups.some(g=>g.enabled)&&<p className="text-xs text-muted-foreground">Consulta hasta 100 mensajes recientes por grupo habilitado y guarda los recibidos sin duplicarlos. El historial disponible depende de Green API. No descarga archivos adjuntos.</p>}
        {historyResults.length>0&&<ul role="status" aria-live="polite" className="space-y-1 rounded-lg border p-4 text-sm">{historyResults.map((result,i)=><li key={i}>{result}</li>)}</ul>}
        {!groups.length&&!discovered.length?<p className="rounded-lg border p-5 text-sm text-muted-foreground">Todavía no hay grupos seleccionados. Configura la instancia y usa Buscar grupos.</p>:null}
        <div className="divide-y rounded-lg border">
          {(discovered.length?discovered:groups).map(g=>{
            const id=g.chatId||g.chat_id||'';
            const stored=groups.find(x=>x.chat_id===id);
            const enabled=stored?.enabled||false;
            return <div key={id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3"><MessageSquare className="h-4 w-4 text-muted-foreground"/><div><p className="font-medium">{g.name||g.display_name}</p><p className="text-xs text-muted-foreground">{enabled?'Sincronización permitida':'No se sincroniza'}{enabled&&<span className="block">{stored?.last_received_at?`Última ingesta: ${new Date(stored.last_received_at).toLocaleString('es-CL')}`:'Sin mensajes almacenados aún'}</span>}</p></div></div>
              <Button variant={enabled?'outline':'default'} disabled={Boolean(busy)} onClick={()=>void toggle(g,!enabled)}>{busy===id?'Guardando…':enabled?'Desactivar':'Activar'}</Button>
            </div>;
          })}
        </div>
        <p className="text-xs text-muted-foreground">Los participantes deben conocer el uso operacional de estos mensajes. La recepción requiere configurar también el webhook seguro de esta instancia en Green API.</p>
      </section>
      <section className="space-y-3 border-t pt-5">
        <h2 className="text-lg font-semibold">Resúmenes diarios</h2>
        {!reports.length?<p className="rounded-lg border p-5 text-sm text-muted-foreground">Sin resúmenes todavía. Se generan después de que lleguen mensajes y se ejecute la tarea diaria.</p>:
        reports.map(r=><article key={r.report_date} className="space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{r.report_date}</h3><span className="text-xs text-muted-foreground">{r.message_count} mensajes · {r.status==='partial'?'Datos parciales':r.status==='ready'?'Actualizado':r.status==='empty'?'Sin mensajes':r.status==='processing'?'Procesando':r.status}</span></div>
          <p className="text-sm text-muted-foreground">{r.summary||'Procesamiento pendiente.'}</p>
          {(r.findings||[]).map((f,i)=><p key={i} className="border-l-2 border-border pl-3 text-sm"><span className="font-medium">{f.domain}: </span>{f.detail}<span className="block text-xs text-muted-foreground">Evidencias: {Array.isArray(f.source_ids)?f.source_ids.length:0} · Pendiente de revisión</span></p>)}
          {r.truncated&&<p className="text-xs text-destructive">Resumen parcial: se alcanzó el límite de procesamiento.</p>}
        </article>)}
      </section>
    </>}
  </main>;
}

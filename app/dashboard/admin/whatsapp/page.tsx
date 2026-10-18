'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RefreshCw, MessageSquare, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WhatsappFindingReview } from '@/components/whatsapp/whatsapp-finding-review';
import { WhatsappOperationalLog } from '@/components/whatsapp/whatsapp-operational-log';
import { WhatsappTriageInbox } from '@/components/whatsapp/whatsapp-triage-inbox';
import { WhatsappSourceRegistry } from '@/components/whatsapp/whatsapp-source-registry';
type Group={id?:string;chatId?:string;chat_id?:string;name?:string;display_name?:string;enabled?:boolean;last_received_at?:string|null};
type GroupDiscovery={total:number;truncated:boolean;sources:{chats:boolean;contacts:boolean}};
type Report={report_date:string;status:string;message_count:number;summary:string;truncated:boolean;findings:any[];source_scope_stale?:boolean};
type Evidence={id:string;group_id:string;message_id:number;download_status:string;scan_status:string;download_error_code?:string|null;scan_error_code?:string|null;mime_type?:string|null;original_file_name?:string|null;size_bytes?:number|null;created_at:string;downloaded_at?:string|null};
type EvidenceSource={sender_name?:string|null;body?:string|null;occurred_at?:string|null;received_at?:string|null};
type EvidenceDetail={id:string;download_status:string;mime_type?:string|null;original_file_name?:string|null;size_bytes?:number|null;sha256?:string|null;downloaded_at?:string|null;extraction_json?:{document_kind?:string;handwritten?:boolean;transcription?:string;tables?:Array<{headers?:string[];rows?:Array<Array<string|null>>}>;fields?:Array<{label?:string;value?:string|null;unit?:string;confidence?:string}>;uncertainties?:string[]};scan_status:string};
export default function WhatsappAdminPage() {
  const [configured,setConfigured]=useState(false);
  const [whatsappReviewEnabled,setWhatsappReviewEnabled]=useState(false);
  const [groups,setGroups]=useState<Group[]>([]);
  const [discovered,setDiscovered]=useState<Group[]>([]);
  const [discovery,setDiscovery]=useState<GroupDiscovery|null>(null);
  const [groupFilter,setGroupFilter]=useState('');
  const [reports,setReports]=useState<Report[]>([]);
  const [evidence,setEvidence]=useState<Evidence[]>([]);
  const [evidenceConfigured,setEvidenceConfigured]=useState(false);
  const [selectedEvidence,setSelectedEvidence]=useState<EvidenceDetail|null>(null);
  const [activeEvidence,setActiveEvidence]=useState<Evidence|null>(null);
  const [evidenceSource,setEvidenceSource]=useState<EvidenceSource|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [detailError,setDetailError]=useState('');
  const detailSequence=useRef(0);
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
    try{const j=await call();setConfigured(j.configured);setWhatsappReviewEnabled(Boolean(j.whatsappReviewEnabled));setGroups(j.groups);setReports(j.reports);setEvidence(j.evidence||[]);setEvidenceConfigured(Boolean(j.evidenceConfigured))}
    catch(e){setError(e instanceof Error?e.message:'No se pudo cargar');}finally{setLoading(false);}
  }
  useEffect(()=>{void reload()},[]);
  async function discover(){
    setBusy('discover');setError('');setDiscovery(null);setGroupFilter('');
    try{
      const j=await call({action:'discover'});
      setDiscovered(j.groups||[]);
      setDiscovery({total:Number(j.total||0),truncated:Boolean(j.truncated),
        sources:{chats:Boolean(j.sources?.chats),contacts:Boolean(j.sources?.contacts)}});
    }catch(e){setError(e instanceof Error?e.message:'No se pudo obtener grupos')}
    finally{setBusy('')}
  }
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
  function closeEvidence(){
    detailSequence.current+=1;
    setActiveEvidence(null);setSelectedEvidence(null);setEvidenceSource(null);
    setDetailLoading(false);setDetailError('');
  }
  async function inspectEvidence(item:Evidence){
    const sequence=++detailSequence.current;
    // Open immediately: the detail must be visible even before the network request finishes.
    setActiveEvidence(item);setSelectedEvidence(null);setEvidenceSource(null);
    setDetailError('');setDetailLoading(true);
    try {
      const response=await fetch('/api/admin/whatsapp/evidence/'+encodeURIComponent(item.id),
        {credentials:'include',cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.evidence)throw new Error(data?.error||'No se pudo leer la evidencia');
      if(sequence!==detailSequence.current)return;
      setSelectedEvidence(data.evidence);setEvidenceSource(data.source||null);
    } catch(err){
      if(sequence===detailSequence.current)setDetailError(err instanceof Error?err.message:'No se pudo consultar el detalle');
    } finally {
      if(sequence===detailSequence.current)setDetailLoading(false);
    }
  }
  async function toggle(g:Group,enabled:boolean){
    const chatId=g.chatId||g.chat_id||'',name=g.name||g.display_name||'';
    setBusy(chatId);setError('');
    try{await call({action:'save',chatId,name,enabled});await reload();}
    catch(e){setError(e instanceof Error?e.message:'Error al guardar')}finally{setBusy('')}
  }
  const groupOptions = (discovery ? discovered : groups);
  const visibleGroups = groupOptions.filter((g) =>
    ((g.name || g.display_name || '') + ' ' + (g.chatId || g.chat_id || ''))
      .toLocaleLowerCase('es').includes(groupFilter.trim().toLocaleLowerCase('es')));
  return <main className="mx-auto max-w-5xl space-y-6">
    <header className="space-y-2 border-b pb-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Administración / Integraciones</p>
      <h1 className="text-2xl font-semibold">WhatsApp · Inteligencia operacional</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">Selecciona qué grupos autorizados pueden aportar evidencia a MOTIL. Los mensajes nunca modifican automáticamente órdenes de trabajo, producción o registros HSE.</p>
    </header>
    <WhatsappSourceRegistry />
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
        {discovery ? <p role="status" className="text-sm text-muted-foreground">
          GREEN-API: {discovery.total} grupos encontrados
          {discovery.truncated ? ' (lista limitada; filtra o consulta de nuevo)' : ''}.
          {!discovery.sources.contacts || !discovery.sources.chats ? ' Una fuente no respondió; los resultados pueden ser parciales.' : ''}
          {discovery.total === 0 ? ' Comprueba que el número conectado a GREEN-API también pertenezca al grupo.' : ''}
        </p> : null}
        {(groups.length>0 || discovery) ? <Input aria-label="Filtrar grupos" value={groupFilter}
          onChange={(event)=>setGroupFilter(event.target.value)} placeholder="Buscar grupo por nombre o ID" /> : null}
        {!groups.length&&!discovery?<p className="rounded-lg border p-5 text-sm text-muted-foreground">Todavía no hay grupos seleccionados. Configura la instancia y usa Buscar grupos.</p>:null}
        {discovery && visibleGroups.length === 0 && groupFilter ? <p className="text-sm text-muted-foreground">
          No encontramos ese grupo en la lista de GREEN-API. Verifica que el número vinculado a la instancia sea participante.
        </p> : null}
        <div className="divide-y rounded-lg border">
          {visibleGroups.map(g=>{
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
      {whatsappReviewEnabled ? <WhatsappTriageInbox dates={reports.map(report=>report.report_date)} /> : null}
      <section className="space-y-3 border-t pt-5">
        <h2 className="text-lg font-semibold">{whatsappReviewEnabled?'Novedades diarias':'Resúmenes diarios'}</h2>
        {!reports.length?<p className="rounded-lg border p-5 text-sm text-muted-foreground">Sin resúmenes todavía. Se generan después de que lleguen mensajes y se ejecute la tarea diaria.</p>:
        reports.map(r=><article key={r.report_date} className="space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{r.report_date}</h3><span className="text-xs text-muted-foreground">{r.source_scope_stale?'Fuentes deshabilitadas · Resumen oculto':r.message_count+' mensajes · '+(r.status==='partial'?'Datos parciales':r.status==='ready'?'Actualizado':r.status==='empty'?'Sin mensajes':r.status==='processing'?'Procesando':r.status)}</span></div>
          <p className="text-sm text-muted-foreground">{r.summary||'Procesamiento pendiente.'}</p>
          {!r.source_scope_stale && whatsappReviewEnabled && r.status === 'ready' &&
             Array.isArray(r.findings) && r.findings.length > 0
            ? <WhatsappFindingReview report={r} onReviewed={reload} /> : null}
          {!r.source_scope_stale && !whatsappReviewEnabled ? (r.findings||[]).map((f:any,i:number)=>
            <p key={i} className="border-l-2 border-border pl-3 text-sm">
              <span className="font-medium">{f.domain}: </span>{f.detail}
              <span className="block text-xs text-muted-foreground">
                Evidencias: {Array.isArray(f.source_ids)?f.source_ids.length:0} · Pendiente de revisión
              </span>
            </p>) : null}
          {r.truncated&&<p className="text-xs text-destructive">Resumen parcial: se alcanzó el límite de procesamiento.</p>}
        </article>)}
      </section>
      {whatsappReviewEnabled ? <WhatsappOperationalLog /> : null}
      <section className="space-y-3 border-t pt-5">
        <div><h2 className="text-lg font-semibold">Evidencias de WhatsApp</h2>
          <p className="text-sm text-muted-foreground">Fotos, documentos y archivos originales protegidos. Las tablas leídas por IA quedan pendientes de revisión humana.</p>
        </div>
        {!evidenceConfigured?<p className="rounded-lg border p-4 text-sm text-muted-foreground">La biblioteca de evidencias aún no está habilitada en este entorno.</p>:
        !evidence.length?<p className="rounded-lg border p-4 text-sm text-muted-foreground">Aún no hay adjuntos registrados.</p>:
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[680px] text-sm"><thead><tr className="bg-muted/30 text-left">
            <th className="px-3 py-2 font-medium">Grupo</th><th className="px-3 py-2 font-medium">Archivo</th>
            <th className="px-3 py-2 font-medium">Descarga</th><th className="px-3 py-2 font-medium">Lectura</th>
            <th className="px-3 py-2 font-medium">Acciones</th></tr></thead><tbody>
            {evidence.map(e=><tr key={e.id} className="border-t">
              <td className="px-3 py-2">{groups.find(g=>g.id===e.group_id)?.display_name||'Grupo autorizado'}</td>
              <td className="px-3 py-2">{e.original_file_name||e.mime_type||'Archivo multimedia'}</td>
              <td className="px-3 py-2">{e.download_status==='stored'?'Guardado':e.download_status==='processing'?'Descargando':e.download_status==='pending'?'Pendiente':e.download_status==='retry'?'Reintentando':e.download_status==='unavailable'?'No disponible':e.download_status==='unsupported'?'Formato no compatible':e.download_status}</td>
              <td className="px-3 py-2">{e.scan_status==='review_ready'?'Para revisar':e.scan_status==='processing'?'Leyendo':e.scan_status==='pending'?'Pendiente':e.scan_status==='manual'?'Revisión manual':e.scan_status==='retry'?'Reintentando':'Sin lectura'}</td>
              <td className="px-3 py-2"><div className="flex flex-wrap items-center gap-3">
                {e.download_status==='stored'&&<a className="font-medium underline underline-offset-2" href={`/api/admin/whatsapp/evidence/${e.id}?file=1`} target="_blank" rel="noopener noreferrer">Ver original</a>}
                <button type="button" className="font-medium underline underline-offset-2" onClick={()=>void inspectEvidence(e)} aria-label={"Detalle de "+(e.original_file_name||e.mime_type||"archivo multimedia")}>Detalle</button>
              </div></td>
            </tr>)}</tbody></table>
        </div>}

      </section>
    </>}
    <Dialog open={Boolean(activeEvidence)} onOpenChange={(open)=>{if(!open)closeEvidence();}}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle de evidencia</DialogTitle>
          <DialogDescription>
            {groups.find(g=>g.id===activeEvidence?.group_id)?.display_name||'Grupo autorizado'} · Original de WhatsApp
          </DialogDescription>
        </DialogHeader>
        {activeEvidence&&<div className="space-y-4 text-sm">
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Archivo</p>
              <p className="break-all font-medium">{selectedEvidence?.original_file_name||activeEvidence.original_file_name||activeEvidence.mime_type||'Archivo multimedia'}</p></div>
            <div><p className="text-xs text-muted-foreground">Descarga</p>
              <p className="font-medium">{activeEvidence.download_status==='stored'?'Original guardado en MOTIL':
                activeEvidence.download_status==='pending'?'En cola de descarga':
                activeEvidence.download_status==='processing'?'Descargando':
                activeEvidence.download_status==='retry'?'Reintentando descarga':'Archivo no disponible todavía'}</p></div>
            <div><p className="text-xs text-muted-foreground">Lectura</p>
              <p>{activeEvidence.scan_status==='review_ready'?'Extraído · Pendiente de revisión':
                activeEvidence.scan_status==='pending'?'Pendiente de análisis':
                activeEvidence.scan_status==='processing'?'Analizando':
                activeEvidence.scan_status==='manual'?'Requiere revisión manual':'Sin lectura todavía'}</p></div>
            <div><p className="text-xs text-muted-foreground">Fecha del archivo</p>
              <p>{evidenceSource?.occurred_at?new Date(evidenceSource.occurred_at).toLocaleString('es-CL'):
                new Date(activeEvidence.created_at).toLocaleString('es-CL')+
                (evidenceSource?' (registro en MOTIL)':' (registro; consultando origen)')}</p></div>
          </div>
          {detailLoading&&<p role="status" className="text-muted-foreground">Cargando mensaje original y trazabilidad…</p>}
          {detailError&&<p role="alert" className="rounded-md border border-destructive/40 p-3 text-destructive">
            {detailError}. El archivo conserva su estado en la lista.</p>}
          {evidenceSource&&<div className="space-y-1 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Mensaje de origen{evidenceSource.sender_name?' · '+evidenceSource.sender_name:''}</p>
            <p className="whitespace-pre-wrap break-words">{evidenceSource.body||'Mensaje con archivo adjunto, sin texto adicional.'}</p>
          </div>}
          {activeEvidence.download_status==='stored'&&<>
            {activeEvidence.mime_type?.startsWith('image/')&&
              <div className="overflow-hidden rounded-lg border bg-muted/20 p-2">
                <Image unoptimized width={960} height={640} alt="Fotografía original de la evidencia de WhatsApp"
                  src={'/api/admin/whatsapp/evidence/'+activeEvidence.id+'?file=1'}
                  className="max-h-[50vh] w-full object-contain"/>
              </div>}
            <a className="inline-flex items-center rounded-md border px-3 py-2 font-medium underline underline-offset-2"
              href={'/api/admin/whatsapp/evidence/'+activeEvidence.id+'?file=1'}
              target="_blank" rel="noopener noreferrer">Ver archivo original</a>
          </>}
          {selectedEvidence?.sha256&&<div>
            <p className="text-xs text-muted-foreground">Integridad del original (SHA-256)</p>
            <p className="break-all font-mono text-xs">{selectedEvidence.sha256}</p>
          </div>}
          {selectedEvidence?.scan_status!=='review_ready'&&
            <p className="rounded-md border p-3 text-muted-foreground">
              {activeEvidence.download_status==='stored'
                ?'El original está guardado. La transcripción y las tablas aún no están disponibles; no se han generado datos canónicos.'
                :'El archivo está identificado en el mensaje, pero aún no se descarga. Podrás ver el original aquí cuando esté guardado.'}
            </p>}
          {selectedEvidence?.scan_status==='review_ready'&&<div className="space-y-3">
            <p className="font-medium">Lectura automática · Pendiente de validación humana</p>
            <p className="text-muted-foreground">{selectedEvidence.extraction_json?.document_kind||'Documento sin clasificar'}{selectedEvidence.extraction_json?.handwritten?' · Contiene escritura manual':''}</p>
            {selectedEvidence.extraction_json?.transcription&&<p className="whitespace-pre-wrap break-words">{selectedEvidence.extraction_json.transcription}</p>}
            {(selectedEvidence.extraction_json?.tables||[]).map((table,i)=><div key={i} className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs"><thead><tr>{(table.headers||[]).map((h,j)=><th key={j} className="border-b p-2 text-left">{h}</th>)}</tr></thead>
                <tbody>{(table.rows||[]).map((row,k)=><tr key={k} className="border-b last:border-0">{row.map((cell,j)=><td key={j} className="p-2">{cell===null?'Ilegible':cell}</td>)}</tr>)}</tbody></table>
            </div>)}
            {(selectedEvidence.extraction_json?.uncertainties||[]).length>0&&
              <p className="text-muted-foreground">Valores inciertos: {selectedEvidence.extraction_json?.uncertainties?.join(' · ')}</p>}
          </div>}
        </div>}
        <DialogFooter><Button variant="outline" onClick={closeEvidence}>Cerrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}

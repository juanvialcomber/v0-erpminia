
'use client';
import useSWR from 'swr';

type Case={key:string;operationDate:string|null;shift:string|null;status:string;treatedTmsRaw:string|null;
  headGradeRaw:string|null;sourceCount:number;duplicateCount:number;independentSources:number;
  magnitudeAnomaly:boolean;conflictingFields:string[];
  sourceRefs:Array<{messageId:string;attachmentId:string;rowIndex:number;tableIndex:number;
    treatedTmsRaw:string|null;headGradeRaw:string|null;humidityRaw:string|null;dateResolution:string}>;};
type Data={summary:{sourceRows:number;reviewCases:number;duplicateCopies:number;conflictingSources:number;
  missingMeasurements:number;missingIdentity:number;magnitudeAnomalies:number;
    latestMeasuredDate:string|null;latestCompleteCandidateDate:string|null;latestTemplateDate:string|null};
  items:Case[];canonicalThrough:string|null;note:string};
const fetcher=async(url:string):Promise<Data>=>{
  const res=await fetch(url,{credentials:'include',cache:'no-store'});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'No fue posible leer la evidencia');
  return data;
};
const status=(s:string)=>({
  needs_review:'Revisar fuente',missing_identity:'Fecha/turno sin resolver',
  conflicting_sources:'Fuentes contradictorias',missing_measurements:'Faltan mediciones',
  magnitude_anomaly:'Magnitud inusual',
  already_canonical:'Ya registrado',
}[s]||'Por revisar');
export function PlantShiftEvidenceReconciliation(){
  const {data,error,isLoading}=useSWR<Data>('/api/produccion/planta-metalurgia/turnos-por-revisar',fetcher,{revalidateOnFocus:false});
  return <section className="rounded-lg border bg-card" aria-label="Turnos pendientes de conciliación">
    <div className="border-b p-4"><h2 className="font-medium">Turnos por revisar</h2>
      <p className="mt-1 text-xs text-muted-foreground">Evidencia de balances recibida por WhatsApp. Sin cambios en la producción oficial.</p>
    </div>
    {isLoading?<p className="p-4 text-sm text-muted-foreground">Conciliando evidencias…</p>:null}
    {error?<p role="alert" className="p-4 text-sm text-destructive">{error.message}</p>:null}
    {data?<div>
      <div className="grid gap-px bg-border sm:grid-cols-4">
        {[
          ['Casos',data.summary.reviewCases],
          ['Duplicados',data.summary.duplicateCopies],
          ['Conflictos',data.summary.conflictingSources],
          ['Incompletos',data.summary.missingMeasurements+data.summary.missingIdentity],
          ['Magnitudes inusuales',data.summary.magnitudeAnomalies],
        ].map(([name,value])=><div key={name} className="bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{name}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        </div>)}
      </div>
      <p className="p-4 text-xs leading-5 text-muted-foreground">
        {data.summary.sourceRows} filas fuente. Último turno oficial: {data.canonicalThrough||'Sin dato'}.
        Último turno con tonelaje y ley de cabeza en la fuente: {data.summary.latestCompleteCandidateDate||'Sin dato'}.
        Último dato parcial observado: {data.summary.latestMeasuredDate||'Sin dato'}.
        Las plantillas con filas vacías no actualizan el corte. Las cifras TMS son toneladas secas, no toneladas húmedas.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr className="border-y text-muted-foreground">
            <th className="px-4 py-2 font-medium">Fecha</th><th className="px-3 py-2 font-medium">Turno</th>
            <th className="px-3 py-2 font-medium">Tratado (TMS)</th><th className="px-3 py-2 font-medium">Ley cabeza</th>
            <th className="px-3 py-2 font-medium">Fuentes</th><th className="px-4 py-2 font-medium">Revisión</th>
          </tr></thead><tbody>{data.items.map(r=><tr key={r.key} className="border-b last:border-0">
            <td className="px-4 py-2 tabular-nums">{r.operationDate||'—'}</td>
            <td className="px-3 py-2">{r.shift||'—'}</td>
            <td className="px-3 py-2 tabular-nums">{r.treatedTmsRaw??'—'}</td>
            <td className="px-3 py-2 tabular-nums">{r.headGradeRaw??'—'}</td>
            <td className="px-3 py-2">{r.sourceCount}
              {r.duplicateCount>0?' ('+r.duplicateCount+' copias)':''}</td>
            <td className="px-4 py-2">
              <span>{status(r.status)}</span>
              {r.magnitudeAnomaly?<p className="mt-1 text-amber-700 dark:text-amber-400">
                Variación superior a tres veces la mediana de las TMS reconocidas. Verificar imagen.
              </p>:null}
              <details className="mt-2">
                <summary className="cursor-pointer underline underline-offset-2">Revisar evidencias</summary>
                <div className="mt-2 space-y-2">
                  {r.sourceRefs.map((e,i)=><div key={e.attachmentId+'-'+e.rowIndex+'-'+i}
                    className="rounded border p-2">
                    <p>Mensaje #{e.messageId} · Fila {e.rowIndex+1}</p>
                    <p>TMS: {e.treatedTmsRaw||'Sin dato'} · Ley: {e.headGradeRaw||'Sin dato'}</p>
                    <a href={'/api/produccion/whatsapp-evidence/'+encodeURIComponent(e.attachmentId)+'?mode=overview'}
                      target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      Ver imagen original
                    </a>
                  </div>)}
                  {r.conflictingFields.length>0?<p>Campos con diferencias: {r.conflictingFields.join(', ')}.</p>:null}
                </div>
              </details>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="border-t p-4 text-xs leading-5 text-muted-foreground">{data.note}</p>
    </div>:null}
  </section>;
}

'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const families = [
  { id: '4x4', label: 'Vehículos 4x4', unit: 'km', intervals: [20000,30000,40000,50000,60000,70000,80000,90000,100000,110000,120000], source: '11 documentos MP20.000–MP120.000 entregados para revisión', verified: true },
  { id: 'generators', label: 'Generadores', unit: 'intervalo documental', intervals: [250,500,750,1000,1250,1500,1750,2000], source: 'Referencias de archivos compartidas por WhatsApp; contenido pendiente de cotejar', verified: false },
  { id: 'compressors', label: 'Compresores eléctricos', unit: 'intervalo documental', intervals: [2000,4000,8000,12000,16000], source: 'Referencias de archivos compartidas por WhatsApp; contenido pendiente de cotejar', verified: false },
] as const;

export function TechnicalGuidelineLibrary() {
  const [familyId, setFamilyId] = useState<string>('4x4');
  const family = families.find((item) => item.id === familyId) || families[0];
  const [selected, setSelected] = useState<number | null>(null);
  const interval = selected !== null && family.intervals.some((value) => value === selected) ? selected : family.intervals[0];

  return <section aria-label="Biblioteca de pautas técnicas" className="space-y-3">
    <div>
      <h2 className="text-lg font-semibold">Biblioteca de pautas técnicas</h2>
      <p className="text-sm text-muted-foreground">Referencias documentales para revisar antes de programar. No son planes activos ni OT generadas.</p>
    </div>
    <Card className="shadow-none"><CardContent className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Familia de equipos">
        {families.map((item) => <button key={item.id} type="button" onClick={() => { setFamilyId(item.id); setSelected(null); }}
          aria-pressed={family.id === item.id}
          className={`rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${family.id === item.id ? 'border-foreground/40 bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}>
          {item.label}
        </button>)}
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <label htmlFor="guideline-interval" className="text-sm font-medium">Intervalo de referencia</label>
          <select id="guideline-interval" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={interval} onChange={(event) => setSelected(Number(event.target.value))}>
            {family.intervals.map((value) => <option key={value} value={value}>{value.toLocaleString('es-CL')} {family.unit}</option>)}
          </select>
        </div>
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{family.label} · MP{interval.toLocaleString('es-CL')}</span>
            <Badge variant="outline">{family.verified ? 'Documento revisado' : 'Pendiente de revisión'}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{family.source}</p>
        </div>
      </div>
      {family.verified ? <p className="text-sm text-muted-foreground">
        Las pautas 4x4 comparten actividades de inspección y servicio. El filtro secundario de combustible
        figura como cambio específico en MP120.000. La aplicabilidad depende del vehículo y su manual.
      </p> : <p className="text-sm text-muted-foreground">
        Intervalo identificado por nombre del archivo recibido. No se atribuyen actividades, unidades de trabajo ni vigencia técnica sin revisar el documento original.
      </p>}
      <p className="border-t pt-3 text-xs text-muted-foreground">
        Fuente documental en revisión · Sin modificar planes, lecturas, activos ni órdenes de trabajo.
        La aprobación y programación corresponden al responsable autorizado.
      </p>
    </CardContent></Card>
  </section>;
}

import Link from 'next/link';
import { WhatsappOperationalUpdates } from '@/components/production/whatsapp-operational-updates';

export default function DespachosNovedadesPage(){
  return <main className="space-y-5">
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Producción / Despachos</p>
      <h1 className="text-2xl font-semibold">Coordinación de concentrado</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Comunicaciones reportadas desde el grupo de coordinación. No equivalen a
        una guía emitida, traslado realizado o tonelaje de concentrado certificado.
      </p>
      <Link className="inline-block pt-1 text-xs underline underline-offset-2"
        href="/dashboard/produccion">Volver a Producción</Link>
    </div>
    <WhatsappOperationalUpdates mode="dispatch"/>
  </main>;
}

import Link from 'next/link';
import { ArrowRight, Drill, Gem, MapPin, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductionSectionShell } from '@/components/production/production-section-shell';
import { WhatsappOperationalUpdates } from '@/components/production/whatsapp-operational-updates';

export default function SondajePage() {
  return (
    <ProductionSectionShell
      title="Perforación"
      description="Ejecución operacional de sondajes: campañas, equipos, metros, avance y calidad de la ejecución. El expediente e interpretación geológica del mismo sondaje canónico vive en Geología → Sondajes."
      capabilities={[
        'Campañas y ejecución de perforación',
        'Metros perforados y avance',
        'Sondas, operadores y estado operacional',
        'Programa mensual versus ejecución real',
        'Revisión trazable de ubicación operacional',
        'Vínculo al mismo sondaje canónico usado por Geología',
      ]}
    >
      <WhatsappOperationalUpdates mode="drilling"/>

      <section className="rounded-lg border bg-muted/15 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Un sondaje, dos responsabilidades</p>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Perforación controla cómo se ejecuta el pozo. Geología usa ese mismo pozo canónico para revisar evidencia, intervalos, resultados e interpretación. No son dos bases de datos distintas.</p>
          </div>
          <Link href="/dashboard/produccion/geologia?tab=holes" className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-primary hover:underline">
            <Gem className="h-4 w-4" /> Ver en Geología <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/dashboard/produccion/sondaje/produccion" className="block">
          <Card className="h-full transition-colors hover:border-primary/50">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Drill className="h-4 w-4" />Operación de perforación</CardTitle><CardDescription>Metros, sondas, operadores, disponibilidad, programa mensual y ejecución real.</CardDescription></CardHeader>
            <CardContent className="flex items-center gap-2 text-sm font-medium text-primary">Abrir operación <ArrowRight className="h-4 w-4" /></CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/produccion/sondaje/exploracion" className="block">
          <Card className="h-full transition-colors hover:border-primary/50">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" />Campañas exploratorias</CardTitle><CardDescription>Planificación y seguimiento operacional de perforación exploratoria. La interpretación permanece en Geología.</CardDescription></CardHeader>
            <CardContent className="flex items-center gap-2 text-sm font-medium text-primary">Abrir campañas <ArrowRight className="h-4 w-4" /></CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/produccion/sondaje/revision-ubicacion" className="block">
          <Card className="h-full transition-colors hover:border-primary/50">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4" />Revisión operacional</CardTitle><CardDescription>Resolver conflictos de mina/sector en reportes de perforación con evidencia humana trazable.</CardDescription></CardHeader>
            <CardContent className="flex items-center gap-2 text-sm font-medium text-primary">Abrir revisión <ArrowRight className="h-4 w-4" /></CardContent>
          </Card>
        </Link>
      </div>
    </ProductionSectionShell>
  );
}

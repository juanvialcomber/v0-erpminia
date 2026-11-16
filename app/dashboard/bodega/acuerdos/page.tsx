'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays, Check, CircleDashed, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';

const validations = [
  { title: 'Reportes que necesita Bodega', owner: 'Esteban + Ariel', detail: 'Definir contenido, frecuencia y destinatarios.' },
  { title: 'Flujo de información', owner: 'Esteban → Ariel', detail: 'Describir entradas, responsables, registros y salidas actuales.' },
  { title: 'Tareas por persona', owner: 'Esteban', detail: 'Levantar las tareas de cada integrante de Bodega.' },
  { title: 'Mínimos críticos por producto', owner: 'Esteban + Ariel', detail: 'Completar un umbral por código y unidad; no aplicar el ejemplo de 5 unidades como dato real.' },
  { title: 'Stock completo de bodega central', owner: 'MOTIL + Bodega', detail: 'Conciliar el corte y dejar fuente, fecha y evidencia de cada diferencia.' },
];

const recommendations = [
  { title: 'Reposición con aprobación', detail: 'Al llegar al mínimo confirmado, MOTIL prepara una propuesta de pedido. La jefatura revisa stock, crédito y necesidad antes de emitirlo.' },
  { title: 'Salidas trazables', detail: 'Registrar cada retiro con vale de consumo; habilitar lectura por código de barras para descontar el producto correcto.' },
  { title: 'Solicitudes comparables', detail: 'Estandarizar los correos de solicitud para clasificar prioridad y medir el tiempo de respuesta.' },
  { title: 'Urgencias visibles', detail: 'Alertar si una solicitud urgente queda postergada sin atención y mantenerla en una cola con responsable y próxima acción.' },
  { title: 'Rutinas planificadas', detail: 'Programar tareas repetitivas como órdenes periódicas. Preparar el pedido a Santiago los miércoles y revisar gestión los lunes.' },
  { title: 'Datos confiables', detail: 'Investigar saldos negativos y diferencias de fin de semana antes de ajustar. Validar fechas de órdenes de compra y corregir cronómetros anómalos.' },
];

export default function BodegaAcuerdosPage() {
  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Bodega · Reunión del 16 de noviembre</PageHeaderEyebrow>
          <PageHeaderTitle>Acuerdos y próximos datos</PageHeaderTitle>
          <PageHeaderDescription>La minuta queda ordenada para completar el levantamiento. Los mínimos, tareas y reportes siguen pendientes de confirmación.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button asChild variant="outline"><Link href="/dashboard/bodega">Volver al inventario</Link></Button>
        </PageHeaderActions>
      </PageHeader>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Contexto de la reunión">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-4 w-4" />Fecha</div>
          <p className="mt-2 text-sm font-medium">16 de noviembre de 2026</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><CircleDashed className="h-4 w-4" />Estado</div>
          <p className="mt-2 text-sm font-medium">Levantamiento por completar</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-4 w-4" />Control</div>
          <p className="mt-2 text-sm font-medium">Sin cambios automáticos de stock ni compras</p>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="validations-title">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Para completar con Bodega</p>
          <h2 id="validations-title" className="mt-1 text-lg font-semibold">Definiciones pendientes</h2>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          {validations.map((item, index) => (
            <div key={item.title} className="grid gap-1 border-b px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_180px_140px] sm:items-center">
              <div><p className="text-sm font-medium">{item.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p></div>
              <p className="text-xs text-muted-foreground">{item.owner}</p>
              <Badge variant="outline" className="w-fit"><CircleDashed className="mr-1 h-3 w-3" />Por definir</Badge>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">La jefatura de Bodega confirma los conteos físicos. Los umbrales críticos se completan por producto y unidad cuando Esteban y Ariel los validen.</p>
      </section>

      <section className="space-y-3" aria-labelledby="recommendations-title">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Diseño operativo</p>
          <h2 id="recommendations-title" className="mt-1 text-lg font-semibold">Propuestas N3uralia + Ariel</h2>
        </div>
        <div className="divide-y rounded-lg border bg-card">
          {recommendations.map((item) => (
            <div key={item.title} className="flex gap-3 px-4 py-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div><p className="text-sm font-medium">{item.title}</p><p className="mt-0.5 max-w-4xl text-sm leading-5 text-muted-foreground">{item.detail}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-muted-foreground/20 bg-muted/20 p-4" aria-label="Criterios de seguridad de datos">
        <p className="text-sm font-medium">Reglas antes de activar</p>
        <ul className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <li>Laudus y el corte central acreditado mantienen la autoridad del saldo; una diferencia se investiga y conserva con evidencia.</li>
          <li>Un umbral genera una propuesta de reposición; nunca emite una compra sin aprobación y verificación de crédito.</li>
          <li>Un retiro sin vale queda como excepción pendiente; no se descuenta ni corrige en silencio.</li>
          <li>Ubicación y foto de pasillo quedan opcionales hasta que esté instalada la nueva bodega.</li>
        </ul>
      </section>

      <div className="flex justify-end">
        <Button asChild variant="ghost"><Link href="/dashboard/bodega/repuestos-criticos">Revisar repuestos críticos <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
      </div>
    </div>
  );
}

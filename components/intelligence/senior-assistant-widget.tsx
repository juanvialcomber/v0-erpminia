'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ArrowUpRight, X } from 'lucide-react';
import { resolveAssistantContext } from '@/lib/intelligence/assistant-context';
import { SpecialistAssistantBody } from '@/components/intelligence/specialist-assistant-body';
import { ControlledMemoryPopover } from '@/components/intelligence/controlled-memory-popover';
import { useMotilSkillAvailability } from '@/hooks/use-motil-skill-availability';

const maintenanceToolCopy: Record<string, string> = {
  search_assets: 'Activos',
  get_maintenance_attention_queue: 'Cola de atención',
  get_asset_context: 'Contexto del activo',
  get_asset_context_batch: 'Contexto de activos',
  get_open_work_orders: 'Órdenes abiertas',
  get_maintenance_plan: 'Plan preventivo',
  get_observed_condition_history: 'Condición observada',
  get_closure_readiness: 'Preparación de cierre',
  prepare_maintenance_decision_case: 'Caso preparado',
};

const inventoryToolCopy: Record<string, string> = {
  read_inventory_overview: 'Resumen de inventario',
  read_inventory_attention: 'Excepciones de stock',
  read_inventory_freshness: 'Frescura de inventario',
  read_procurement_overview: 'Resumen de compras',
  read_recent_purchase_orders: 'Órdenes recientes',
  read_procurement_quality: 'Calidad de compras',
};

const procurementToolCopy: Record<string, string> = {
  read_procurement_overview: 'Resumen de compras',
  read_recent_purchase_orders: 'Órdenes recientes',
  read_procurement_quality: 'Calidad de compras',
  read_inventory_overview: 'Resumen de inventario',
  read_inventory_attention: 'Excepciones de stock',
  read_inventory_freshness: 'Frescura de inventario',
};

const productionToolCopy: Record<string, string> = {
  read_production_daily_fine: 'Cobre fino diario',
  read_production_flow: 'Flujo de producción',
  read_production_metallurgy: 'Metalurgia determinística',
  read_production_drilling_summary: 'Resumen de perforación',
  read_production_fidelity: 'Fidelidad de fuentes',
  read_inventory_overview: 'Resumen de inventario',
  read_inventory_attention: 'Excepciones de stock',
  read_inventory_freshness: 'Frescura de inventario',
  read_procurement_overview: 'Resumen de compras',
  read_recent_purchase_orders: 'Órdenes recientes',
  read_procurement_quality: 'Calidad de compras',
};

const financeToolCopy: Record<string, string> = {
  read_finance_overview: 'Resumen financiero',
  read_finance_cost_centers: 'Centros de costo',
  read_finance_reconciliation: 'Conciliación de activos',
  read_maintenance_cost_centers: 'Costos de mantenimiento',
  read_procurement_overview: 'Resumen de compras',
  read_recent_purchase_orders: 'Órdenes recientes',
  read_procurement_quality: 'Calidad de compras',
  read_production_daily_fine: 'Cobre fino diario',
  read_production_flow: 'Flujo de producción',
  read_production_metallurgy: 'Metalurgia determinística',
};

const dataHealthToolCopy: Record<string, string> = {
  read_data_health_production: 'Calidad de Producción',
  read_data_health_maintenance: 'Calidad de Mantención',
  read_data_health_inventory: 'Calidad de Inventario',
  read_data_health_procurement: 'Calidad de Compras',
};

const documentsToolCopy: Record<string, string> = {
  read_hse_documents: 'Documentos HSE',
  read_legal_documents: 'Documentos legales',
  read_contracts: 'Contratos',
};

const executiveToolCopy: Record<string, string> = {
  read_executive_production: 'Producción',
  read_executive_maintenance: 'Mantención',
  read_executive_inventory: 'Inventario',
  read_executive_procurement: 'Compras',
  read_executive_finance: 'Finanzas',
};

const specialistConfig = {
  maintenance: {
    endpoint: '/api/maintenance/senior-assistant',
    loadingCopy: 'Cargando contexto de mantenimiento…',
    emptyCopy: 'Pregunta qué requiere atención, qué evidencia lo respalda, qué contradice la señal y cuál es la próxima acción de mayor valor.',
    placeholder: 'Pregunta al Asistente de Mantenimiento…',
    toolCopy: maintenanceToolCopy,
  },
  geology: {
    endpoint: '/api/produccion/geologia/assistant',
    loadingCopy: 'Cargando contexto geológico canónico…',
    emptyCopy: 'Pregunta por evidencia geológica, incertidumbre, hipótesis revisables y la siguiente validación humana de mayor valor.',
    placeholder: 'Pregunta al Asistente de Geología…',
    toolCopy: {},
  },
  inventory: {
    endpoint: '/api/inventory/assistant',
    loadingCopy: 'Cargando inventario canónico…',
    emptyCopy: 'Pregunta por stock, quiebres, reposición, valorización y dependencias de compras. La frescura de la fuente se declara explícitamente.',
    placeholder: 'Pregunta al Asistente de Inventario…',
    toolCopy: inventoryToolCopy,
  },
  procurement: {
    endpoint: '/api/procurement/assistant',
    loadingCopy: 'Cargando compras canónicas…',
    emptyCopy: 'Pregunta por órdenes, proveedores, montos, estados y dependencias de inventario. No se infieren recepciones o entregas sin evidencia.',
    placeholder: 'Pregunta al Asistente de Compras…',
    toolCopy: procurementToolCopy,
  },
  production: {
    endpoint: '/api/production/assistant',
    loadingCopy: 'Cargando evidencia canónica de producción…',
    emptyCopy: 'Pregunta por tratamiento, cobre fino, recuperación, flujo, perforación y excepciones de fuente. El asistente separa valores reportados de cálculos determinísticos.',
    placeholder: 'Pregunta al Asistente de Producción…',
    toolCopy: productionToolCopy,
  },
  finance: {
    endpoint: '/api/finance/assistant',
    loadingCopy: 'Cargando evidencia financiera canónica…',
    emptyCopy: 'Pregunta por compromisos, costos y centros de costo. El asistente conserva la fecha de corte de cada fuente y no mezcla compromiso, gasto reconocido ni pago.',
    placeholder: 'Pregunta al Asistente de Finanzas…',
    toolCopy: financeToolCopy,
  },
  documents: {
    endpoint: '/api/documents/assistant',
    loadingCopy: 'Cargando documentos autorizados…',
    emptyCopy: 'Pregunta por vigencias, vencimientos, contratos y evidencia documental faltante. Sólo se usan fuentes tenant-safe con organización explícita.',
    placeholder: 'Pregunta al Asistente de Documentos…',
    toolCopy: documentsToolCopy,
  },
  data_health: {
    endpoint: '/api/data-quality/assistant',
    loadingCopy: 'Cargando salud y cobertura de fuentes autorizadas…',
    emptyCopy: 'Pregunta qué fuentes están atrasadas, incompletas o en conflicto y cómo limita eso una decisión. Sólo se analizan dominios que puedes leer.',
    placeholder: 'Pregunta al Asistente de Calidad de Datos…',
    toolCopy: dataHealthToolCopy,
  },
  executive: {
    endpoint: '/api/intelligence/executive-assistant',
    loadingCopy: 'Construyendo contexto ejecutivo autorizado…',
    emptyCopy: 'Pregunta qué requiere atención de gerencia. La síntesis usa sólo dominios autorizados, mantiene fechas de corte separadas y prioriza máximo tres asuntos.',
    placeholder: 'Pregunta al Asistente Senior MOTIL…',
    toolCopy: executiveToolCopy,
  },
} as const;

type SpecialistDomain = keyof typeof specialistConfig;

const controlledMemoryDomains = new Set<string>([
  'executive',
  'maintenance',
  'geology',
  'inventory',
  'procurement',
  'production',
  'finance',
  'documents',
  'data_health',
]);

export function SeniorAssistantMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 72" aria-hidden="true" className={className} focusable="false">
      <path d="M15 23.5c0-8.6 7-15.5 15.5-15.5h11C50 8 57 14.9 57 23.5V25c5.2 3.8 8.5 10 8.5 17 0 11.9-9.6 21.5-21.5 21.5H31.2L19 68v-7.8C11.6 56.7 6.5 49.1 6.5 40.3 6.5 33.4 9.8 27.3 15 23.5Z" className="fill-background stroke-border" strokeWidth="2" />
      <path d="M20 23.5c1.7-7.4 8.3-12.8 16-12.8s14.3 5.4 16 12.8H20Z" className="fill-card stroke-foreground" strokeWidth="2" />
      <path d="M31 10.8h10l2.2 12.7H28.8L31 10.8Z" className="fill-primary" />
      <path d="M15.8 25h40.4v4.7H15.8V25Z" className="fill-foreground" />
      <rect x="16" y="29.5" width="40" height="27" rx="9" className="fill-card stroke-secondary" strokeWidth="3" />
      <path d="M24.5 41.5c1.7-2.5 5.2-2.5 7 0M40.5 41.5c1.7-2.5 5.2-2.5 7 0" className="fill-none stroke-secondary" strokeLinecap="round" strokeWidth="3" />
      <path d="M30.8 48.2c3.5 3.2 7 3.2 10.4 0" className="fill-none stroke-primary" strokeLinecap="round" strokeWidth="3" />
      <path d="M58.5 32.5c3.7 2 5.5 5.3 5.5 9.2 0 3.6-1.5 6.4-4.4 8.4" className="fill-none stroke-secondary" strokeLinecap="round" strokeWidth="3" />
      <path d="M61.8 18.2h3.8M60.8 12.8l2.7-2.7M60.8 23.5l2.7 2.7" className="fill-none stroke-primary" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

export function SeniorAssistantWidget() {
  const pathname = usePathname();
  const { user } = useAuth();
  const skillAvailability = useMotilSkillAvailability();
  // The cookie only controls visibility; the endpoint verifies cargo and permissions on the server.
  const engineeringCargo = String(user?.cargo || '').trim().toUpperCase() === 'JEFE ING. PLA MINA';
  const isEngineeringContext = pathname === '/dashboard' || pathname.startsWith('/dashboard/produccion/topografia');
  const engineeringAssistant = engineeringCargo && isEngineeringContext ? {
    endpoint: '/api/intelligence/engineering-assistant',
    loadingCopy: 'Verificando el plan, tus tareas y las brechas de fuente…',
    emptyCopy: 'Las respuestas usan evidencia vigente del cargo. No se modifican datos ni se guarda historial.',
    placeholder: 'Consulta sobre planificación minera…',
    toolCopy: {},
  } : null;
  const engineeringPrompts = [
    '¿Cuál es el estado real del plan minero?',
    '¿Qué fuentes topográficas impiden comparar el avance?',
    '¿Qué debo verificar primero con Operaciones?',
  ];
  const normalizedRole = String(user?.cargo || '').trim().toLowerCase();
  const mineProfiles = {
    'jefe mina peumo': {
      title: 'Asistente de Jaime · Mina Peumo',
      context: 'Jefatura de Mina Peumo',
      starters: [
        '¿Cuáles son las prioridades verificadas de Peumo?',
        'Genera un informe semanal de la mina Peumo.',
        '¿Qué indica el plan disponible y qué información sigue faltando?',
      ],
    },
    'jefe mina don jaime': {
      title: 'Asistente de Cristian · Mina Don Jaime',
      context: 'Jefatura de Mina Don Jaime',
      starters: [
        '¿Qué requiere atención en Don Jaime?',
        'Dame el avance verificable del plan de Don Jaime.',
        'Prepara el reporte semanal de producción y mantenimiento.',
      ],
    },
    'jefe de taller mina don jaime': {
      title: 'Asistente de Joaquín · Taller Don Jaime',
      context: 'Taller Don Jaime',
      starters: [
        '¿Qué OT debo priorizar y cuáles puedo cerrar?',
        'Muéstrame pendientes de repuestos, fotos y aprobación.',
        'Genera un informe semanal del taller.',
      ],
    },
  } as const;
  const roleProfile = mineProfiles[normalizedRole as keyof typeof mineProfiles] || null;
  // Only the server-validated assistant may access the data. This cookie is UI context alone.
  const mineAssistant = roleProfile ? {
    endpoint: '/api/intelligence/mine-role-assistant',
    loadingCopy: 'Leyendo evidencia de tu mina y cargo…',
    emptyCopy: 'Consulta tus OT, equipos, avance, seguridad y prioridades. Los informes indican fecha de fuente; las solicitudes quedan pendientes de revisión.',
    placeholder: 'Pregunta a tu asistente operacional…',
    toolCopy: {},
  } : null;
  const [open, setOpen] = useState(false);
  const context = useMemo(() => resolveAssistantContext(pathname), [pathname]);
  const regularSpecialist = Object.prototype.hasOwnProperty.call(specialistConfig, context.domain)
    ? specialistConfig[context.domain as SpecialistDomain]
    : null;
  const specialist = mineAssistant || engineeringAssistant || regularSpecialist;
  const displayTitle = roleProfile?.title || (engineeringAssistant ? 'Asistente de Ingeniería Minera' : context.title);
  const displayContext = roleProfile?.context || (engineeringAssistant ? 'Ingeniería / Topografía' : context.label);
  const showsControlledMemory = !mineAssistant && !engineeringAssistant && controlledMemoryDomains.has(context.domain);
  const contextualStarters = roleProfile?.starters
    ? [...roleProfile.starters]
    : engineeringAssistant
      ? engineeringPrompts
      : skillAvailability.promptsFor(context.domain, context.suggestedPrompts);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      {open ? (
        <section
          aria-label={displayTitle}
          className={specialist
            ? 'fixed bottom-24 right-4 z-50 flex h-[min(700px,calc(100vh-7rem))] w-[min(460px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl md:right-6'
            : 'fixed bottom-24 right-4 z-50 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card shadow-xl md:right-6'}
        >
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-background">
              <SeniorAssistantMark className="size-10" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-semibold text-foreground">{displayTitle}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">Contexto: {displayContext}</p>
            </div>
            {showsControlledMemory ? <ControlledMemoryPopover /> : null}
            <button type="button" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Cerrar ${context.title}`}>
              <X className="size-4" />
            </button>
          </div>

          {specialist ? (
            <SpecialistAssistantBody
              endpoint={specialist.endpoint}
              starters={contextualStarters}
              emptyCopy={specialist.emptyCopy}
              loadingCopy={specialist.loadingCopy}
              placeholder={specialist.placeholder}
              toolCopy={specialist.toolCopy}
            />
          ) : (
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-md border border-secondary/30 bg-secondary/10 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-secondary">Contexto local primero</span>
                <p className="text-sm leading-6 text-foreground">{context.scopeHint}</p>
              </div>
              <div className="space-y-2" aria-label={`Preguntas sugeridas para ${context.label}`}>
                {context.suggestedPrompts.map((prompt) => (
                  <p key={prompt} className="rounded-md border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">{prompt}</p>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link href="/dashboard/decisiones" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center justify-between gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  Centro Ejecutivo <ArrowUpRight className="size-4" />
                </Link>
                <Link href="/dashboard/acciones" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary">
                  Mis acciones <ArrowUpRight className="size-4 text-secondary" />
                </Link>
              </div>
              <p className="text-[10px] leading-4 text-muted-foreground">El mismo núcleo de inteligencia decide cuándo mantenerse en este módulo y cuándo ampliar evidencia. Ninguna acción operacional se ejecuta sin autorización.</p>
            </div>
          )}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-5 right-4 z-50 flex size-16 items-center justify-center rounded-full border border-primary/50 bg-card shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background md:right-6"
        aria-label={open ? `Cerrar ${context.title}` : `Abrir ${context.title}`}
        aria-expanded={open}
        title={context.title}
      >
        <SeniorAssistantMark className="size-14" />
        <span className="sr-only">{context.title}</span>
      </button>
    </>
  );
}
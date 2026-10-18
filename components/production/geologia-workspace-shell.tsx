'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GeologiaDashboard } from '@/components/production/geologia-dashboard';
import { GeologiaHistoricalCanonical } from '@/components/production/geologia-historical-canonical';
import { GeologiaCanonicalStatus } from '@/components/production/geologia-canonical-status';
import { GeologiaDataCompleteness } from '@/components/production/geologia-data-completeness';
import { GeologiaInterpretation } from '@/components/production/geologia-interpretation';
import { GeologiaInterpretationMatrix } from '@/components/production/geologia-interpretation-matrix';
import { GeologiaNextBestEvidence } from '@/components/production/geologia-next-best-evidence';
import { GeologiaCoreVision } from '@/components/production/geologia-corevision';
import { WhatsappOperationalUpdates } from '@/components/production/whatsapp-operational-updates';

const tabs = [
  ['today', 'Resumen'],
  ['pending', 'Tareas'],
  ['holes', 'Ficha'],
  ['corevision', 'CoreVision'],
  ['interpretation', 'Lectura'],
  ['matrix', 'Matriz'],
  ['results', 'Resultados'],
  ['completeness', 'Cobertura'],
  ['priorities', 'Excepciones'],
  ['canonical', 'Estado'],
  ['history', 'Histórico'],
] as const;

type TabKey = (typeof tabs)[number][0];
type GroupKey = 'today' | 'holes' | 'interpretation' | 'evidence' | 'history';

type NavigationGroup = {
  key: GroupKey;
  label: string;
  description: string;
  tabs: ReadonlyArray<readonly [TabKey, string]>;
};

const navigationGroups: NavigationGroup[] = [
  {
    key: 'today',
    label: 'Hoy',
    description: 'Atención y decisiones actuales.',
    tabs: [
      ['today', 'Resumen'],
      ['pending', 'Tareas'],
    ],
  },
  {
    key: 'holes',
    label: 'Sondajes',
    description: 'Expediente geológico del sondaje canónico.',
    tabs: [
      ['holes', 'Ficha'],
      ['corevision', 'CoreVision'],
    ],
  },
  {
    key: 'interpretation',
    label: 'Interpretación',
    description: 'Lectura profesional e hipótesis revisables.',
    tabs: [
      ['interpretation', 'Lectura'],
      ['matrix', 'Matriz'],
    ],
  },
  {
    key: 'evidence',
    label: 'Evidencia',
    description: 'Resultados, cobertura, excepciones de evidencia y estado canónico.',
    tabs: [
      ['results', 'Resultados'],
      ['completeness', 'Cobertura'],
      ['priorities', 'Excepciones'],
      ['canonical', 'Estado'],
    ],
  },
  {
    key: 'history',
    label: 'Histórico',
    description: 'Contexto histórico separado de la operación actual.',
    tabs: [['history', 'Histórico']],
  },
];

const tabKeys = new Set<TabKey>(tabs.map(([key]) => key));
const groupByTab = new Map<TabKey, GroupKey>(
  navigationGroups.flatMap((group) => group.tabs.map(([key]) => [key, group.key] as const)),
);

const dashboardLabels: Record<Exclude<TabKey, 'history' | 'canonical' | 'completeness' | 'interpretation' | 'matrix' | 'priorities' | 'corevision'>, string> = {
  today: 'Hoy',
  holes: 'Mapa y sondajes',
  results: 'Resultados',
  pending: 'Pendientes',
};

export function GeologiaWorkspaceShell() {
  const [tab, setTab] = useState<TabKey>('today');
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab') as TabKey | null;
    if (requested && tabKeys.has(requested)) setTab(requested);
  }, []);

  useEffect(() => {
    if (tab === 'history' || tab === 'canonical' || tab === 'completeness' || tab === 'interpretation' || tab === 'matrix' || tab === 'priorities' || tab === 'corevision') return;
    const root = dashboardRef.current;
    if (!root) return;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('nav[aria-label="Vistas de Geología"] button'));
    const target = buttons.find((button) => button.textContent?.trim() === dashboardLabels[tab]);
    target?.click();
  }, [tab]);

  const activeGroup = useMemo(() => {
    const key = groupByTab.get(tab) || 'today';
    return navigationGroups.find((group) => group.key === key) || navigationGroups[0];
  }, [tab]);

  const selectTab = (key: TabKey) => {
    setTab(key);
    const url = new URL(window.location.href);
    if (key === 'today') url.searchParams.delete('tab');
    else url.searchParams.set('tab', key);
    url.searchParams.delete('recovery');
    url.searchParams.delete('hole');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const selectGroup = (group: NavigationGroup) => {
    if (group.key === activeGroup.key) return;
    selectTab(group.tabs[0][0]);
  };

  const showDashboard = !['history', 'canonical', 'completeness', 'interpretation', 'matrix', 'priorities', 'corevision'].includes(tab);
  const dashboardClassName = `geologia-dashboard-simplified ${showDashboard ? 'block' : 'hidden'} ${tab === 'holes' ? 'geologia-holes-focus' : ''}`;

  return (
    <div className="space-y-5">
      <section className="border-b pb-3" aria-label="Controles locales de Geología">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Vista de Geología">
          {navigationGroups.map((group) => (
            <Button
              key={group.key}
              size="sm"
              variant="ghost"
              role="tab"
              aria-selected={activeGroup.key === group.key}
              onClick={() => selectGroup(group)}
              className={`h-8 px-2.5 text-xs ${activeGroup.key === group.key ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
            >
              {group.label}
            </Button>
          ))}
        </div>
        {activeGroup.tabs.length > 1 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="mr-1">Vista</span>
            {activeGroup.tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => selectTab(key)}
                aria-current={tab === key ? 'page' : undefined}
                className={`rounded-md px-2 py-1 transition-colors ${tab === key ? 'bg-muted font-medium text-foreground' : 'hover:bg-muted/60 hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">{activeGroup.description}</p>
        {activeGroup.key === 'holes' ? (
          <p className="mt-1 text-xs text-muted-foreground">
            El expediente usa el mismo sondaje canónico de Producción → Perforación; aquí sólo cambia la responsabilidad geológica.
          </p>
        ) : null}
      </section>

      {tab === 'canonical' ? (
        <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Rol del Estado canónico">
          <div>
            <p className="text-sm font-medium">Estado = control y trazabilidad canónica</p>
            <p className="mt-1 text-xs text-muted-foreground">Aquí se revisan reconciliación, bloqueos y procedencia. Toda acción operativa se atiende en Hoy → Tareas para mantener una sola cola de trabajo.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => selectTab('pending')}>Abrir Hoy → Tareas</Button>
        </section>
      ) : null}

      {tab === 'today' ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mina · Actividad diaria</p>
          <WhatsappOperationalUpdates mode="mine" />
          <p className="text-xs text-muted-foreground">Después de las novedades del turno se muestran las tareas, indicadores y antecedentes geológicos. Los mensajes no sustituyen los registros oficiales.</p>
        </div>
      ) : null}

      <div ref={dashboardRef} className={dashboardClassName}>
        <style>{`
          nav[aria-label="Vistas de Geología"] { display: none !important; }
          .geologia-dashboard-simplified section[aria-label="Resumen geológico"] { display: none !important; }
          .geologia-holes-focus table th:nth-child(4),
          .geologia-holes-focus table td:nth-child(4) { display: none !important; }
          .geologia-holes-focus aside > section:first-child { display: none !important; }
          .geologia-holes-focus > div.space-y-6 > div.grid > div.space-y-5 > section:first-child:has(.border-dashed) { display: none !important; }
        `}</style>
        <GeologiaDashboard />
      </div>

      {tab === 'interpretation' ? <GeologiaInterpretation /> : null}
      {tab === 'matrix' ? <GeologiaInterpretationMatrix /> : null}
      {tab === 'priorities' ? <GeologiaNextBestEvidence /> : null}
      {tab === 'corevision' ? <GeologiaCoreVision /> : null}
      {tab === 'completeness' ? <GeologiaDataCompleteness /> : null}
      {tab === 'canonical' ? <GeologiaCanonicalStatus /> : null}
      {tab === 'history' ? <GeologiaHistoricalCanonical /> : null}
    </div>
  );
}

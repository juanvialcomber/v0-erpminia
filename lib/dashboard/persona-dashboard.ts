export type PersonaDashboardKey =
  | 'ariel_planning'
  | 'joaquin_workshop'
  | 'mauricio_supervision'
  | 'daniel_finance'
  | 'pedro_operations'
  | null;

export type PersonaDashboardConfig = {
  key: Exclude<PersonaDashboardKey, null>;
  eyebrow: string;
  title: string;
  description: string;
  attentionTitle: string;
  attentionSubtitle: string;
  primaryAction: { label: string; href: string };
  shortcuts: Array<{ label: string; href: string; detail: string }>;
  summaryLabels: {
    owners: string;
    critical: string;
    overdue: string;
    escalations: string;
    backlog: string;
  };
};

function normalize(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function resolvePersonaDashboard(cargoName?: string | null): PersonaDashboardKey {
  const cargo = normalize(cargoName);
  if (cargo === 'jefe de planificacion') return 'ariel_planning';
  if (cargo === 'jefe de taller mina don jaime') return 'joaquin_workshop';
  if (cargo === 'jefe de equipos moviles y estacionarios') return 'mauricio_supervision';
  if (cargo === 'gerente de finanzas') return 'daniel_finance';
  if (cargo === 'gerente de operaciones') return 'pedro_operations';
  return null;
}

export const PERSONA_DASHBOARDS: Record<Exclude<PersonaDashboardKey, null>, PersonaDashboardConfig> = {
  ariel_planning: {
    key: 'ariel_planning',
    eyebrow: 'PLANIFICACIÓN Y MANTENCIÓN',
    title: 'Plan de trabajo y restricciones',
    description: 'Prioriza OT críticas, restricciones de abastecimiento y decisiones que cambian el plan de mantenimiento de hoy.',
    attentionTitle: 'Lo que puede alterar el plan',
    attentionSubtitle: 'Primero excepciones, bloqueos y decisiones; después el detalle.',
    primaryAction: { label: 'Abrir planificación', href: '/dashboard/mantenimiento/planificacion' },
    shortcuts: [
      { label: 'Planificación', href: '/dashboard/mantenimiento/planificacion', detail: 'Carga, prioridades, recursos y secuencia de trabajo.' },
      { label: 'Torre de control', href: '/dashboard/mantenimiento/torre-control', detail: 'Disponibilidad, detenciones y estado operacional por equipo.' },
      { label: 'Órdenes de trabajo', href: '/dashboard/mantenimiento/ordenes-trabajo', detail: 'Cartera activa, OTe, bloqueos y cierres.' },
      { label: 'Abastecimiento', href: '/dashboard/compras', detail: 'Necesidades de repuestos y compras que condicionan mantenimiento.' },
      { label: 'Decisiones', href: '/dashboard/decisiones', detail: 'Excepciones y decisiones pendientes con evidencia.' },
    ],
    summaryLabels: {
      owners: 'Decisiones propias',
      critical: 'Críticas',
      overdue: 'Vencidas',
      escalations: 'Escaladas',
      backlog: 'Pendientes',
    },
  },
  joaquin_workshop: {
    key: 'joaquin_workshop',
    eyebrow: 'TALLER DON JAIME',
    title: 'Mi turno',
    description: 'Muestra primero el trabajo que puedes ejecutar ahora: prioridad, OT, equipo, bloqueo y siguiente acción.',
    attentionTitle: 'Qué ejecutar ahora',
    attentionSubtitle: 'Sólo tareas accionables del turno y excepciones que impiden avanzar.',
    primaryAction: { label: 'Ver mis OT', href: '/dashboard/mantenimiento/ordenes-trabajo' },
    shortcuts: [
      { label: 'Órdenes de trabajo', href: '/dashboard/mantenimiento/ordenes-trabajo', detail: 'Inicia, pausa, reanuda y cierra trabajo autorizado.' },
      { label: 'Calendario', href: '/dashboard/mantenimiento/calendario', detail: 'Revisa trabajo programado y OTe.' },
      { label: 'Equipos', href: '/dashboard/mantenimiento/equipos', detail: 'Consulta ficha, condición e historial del activo.' },
      { label: 'Registrar horómetro', href: '/dashboard/mantenimiento/horometros/registrar', detail: 'Registra evidencia operativa cuando corresponda.' },
    ],
    summaryLabels: {
      owners: 'Para mí',
      critical: 'Urgentes',
      overdue: 'Atrasadas',
      escalations: 'Escaladas',
      backlog: 'Pendientes',
    },
  },
  mauricio_supervision: {
    key: 'mauricio_supervision',
    eyebrow: 'SUPERVISIÓN DE EQUIPOS',
    title: 'Aprobaciones y excepciones',
    description: 'Concentra cierres por revisar, equipos con riesgo y excepciones que requieren una decisión de supervisión.',
    attentionTitle: 'Decisiones pendientes',
    attentionSubtitle: 'Primero aprobaciones, devoluciones y bloqueos de alto impacto.',
    primaryAction: { label: 'Revisar decisiones', href: '/dashboard/mantenimiento/decision-intelligence' },
    shortcuts: [
      { label: 'Decisión operacional', href: '/dashboard/mantenimiento/decision-intelligence', detail: 'Excepciones y decisiones de mantenimiento con evidencia.' },
      { label: 'Órdenes de trabajo', href: '/dashboard/mantenimiento/ordenes-trabajo', detail: 'Revisa cierres, responsables, evidencia y estado.' },
      { label: 'Disponibilidad', href: '/dashboard/mantenimiento/disponibilidad', detail: 'Detecta equipos detenidos o degradados.' },
      { label: 'Confiabilidad', href: '/dashboard/mantenimiento/confiabilidad', detail: 'Observa recurrencia, criticidad y comportamiento por activo.' },
    ],
    summaryLabels: {
      owners: 'Por decidir',
      critical: 'Críticas',
      overdue: 'Vencidas',
      escalations: 'Escaladas',
      backlog: 'En revisión',
    },
  },
  daniel_finance: {
    key: 'daniel_finance',
    eyebrow: 'GERENCIA DE FINANZAS',
    title: 'Control financiero',
    description: 'Separa cifras confiables de conciliaciones pendientes y prioriza compromisos, activos y excepciones que requieren revisión.',
    attentionTitle: 'Qué cifra requiere revisión',
    attentionSubtitle: 'Excepciones financieras y decisiones pendientes antes del detalle contable.',
    primaryAction: { label: 'Abrir Finanzas', href: '/dashboard/finanzas' },
    shortcuts: [
      { label: 'Finanzas', href: '/dashboard/finanzas', detail: 'Compromisos, reconocimiento, conciliaciones y trazabilidad.' },
      { label: 'Activos fijos', href: '/dashboard/finanzas/activos', detail: 'Depreciación, candidatos y conciliación con Laudus.' },
      { label: 'Pagos', href: '/dashboard/finanzas/pagos', detail: 'Pagos, estados y excepciones pendientes.' },
      { label: 'Centros de costo', href: '/dashboard/finanzas/centros', detail: 'Cobertura y clasificación por centro.' },
      { label: 'Valor', href: '/dashboard/valor', detail: 'Outcomes medidos y evidencia económica atribuible.' },
    ],
    summaryLabels: {
      owners: 'Por revisar',
      critical: 'Críticas',
      overdue: 'Vencidas',
      escalations: 'Escaladas',
      backlog: 'Pendientes',
    },
  },
  pedro_operations: {
    key: 'pedro_operations',
    eyebrow: 'GERENCIA DE OPERACIONES',
    title: 'Control operacional',
    description: 'Une producción, mantenimiento y decisiones escaladas para mostrar sólo lo que puede afectar continuidad operacional.',
    attentionTitle: 'Lo que requiere gestión hoy',
    attentionSubtitle: 'Desviaciones, escalaciones y bloqueos que cruzan áreas.',
    primaryAction: { label: 'Abrir centro ejecutivo', href: '/dashboard/decisiones' },
    shortcuts: [
      { label: 'Producción', href: '/dashboard/produccion', detail: 'Estado operacional, fuentes y avance disponible.' },
      { label: 'Torre de control', href: '/dashboard/mantenimiento/torre-control', detail: 'Disponibilidad y detenciones que afectan continuidad.' },
      { label: 'Decisiones', href: '/dashboard/decisiones', detail: 'Excepciones escaladas y decisiones transversales.' },
      { label: 'Compras', href: '/dashboard/compras', detail: 'Abastecimiento que condiciona mantenimiento u operación.' },
      { label: 'Valor', href: '/dashboard/valor', detail: 'Outcomes operacionales medidos, sin confundir UAT con operación.' },
    ],
    summaryLabels: {
      owners: 'Por decidir',
      critical: 'Críticas',
      overdue: 'Vencidas',
      escalations: 'Escaladas',
      backlog: 'Pendientes',
    },
  },
};

import type { QueryCapability } from '@/lib/intelligence/query-router';

export type AssistantDomain =
  | 'global'
  | 'maintenance'
  | 'geology'
  | 'inventory'
  | 'procurement'
  | 'production'
  | 'finance'
  | 'documents'
  | 'legal'
  | 'data_health'
  | 'executive';

export type AssistantContext = {
  domain: AssistantDomain;
  label: string;
  title: string;
  scopeHint: string;
  capabilities: QueryCapability[];
  suggestedPrompts: string[];
};

const CONTEXTS: Array<AssistantContext & { prefixes: string[] }> = [
  {
    domain: 'geology',
    prefixes: ['/dashboard/produccion/geologia', '/dashboard/geologia'],
    label: 'Geología',
    title: 'Asistente de Geología',
    scopeHint: 'Parte desde Geología y amplía el análisis sólo cuando la pregunta requiere evidencia de otros dominios.',
    capabilities: ['geology'],
    suggestedPrompts: [
      '¿Qué está pasando hoy en Geología y qué debería priorizar?',
      '¿Qué observaciones tienen información incompleta?',
      '¿Qué hipótesis requieren validación humana antes de concluir?',
    ],
  },
  {
    domain: 'maintenance',
    prefixes: ['/dashboard/mantenimiento', '/dashboard/mantencion'],
    label: 'Mantenimiento',
    title: 'Asistente de Mantenimiento',
    scopeHint: 'Parte desde activos, OT y pautas; cruza inventario o compras sólo cuando aporta evidencia causal.',
    capabilities: ['maintenance'],
    suggestedPrompts: [
      '¿Qué equipos requieren atención primero y por qué?',
      '¿Qué preventivos están vencidos y con qué evidencia?',
      '¿Qué dato faltante tendría más valor para decidir mejor?',
    ],
  },
  {
    domain: 'inventory',
    prefixes: ['/dashboard/inventario', '/dashboard/bodega'],
    label: 'Inventario y Bodega',
    title: 'Asistente de Inventario',
    scopeHint: 'Parte desde stock y movimientos; cruza mantenimiento o compras sólo cuando la pregunta lo exige.',
    capabilities: ['inventory'],
    suggestedPrompts: [
      '¿Qué stock requiere atención ahora?',
      '¿Qué productos están bajo mínimo o sin disponibilidad?',
      '¿Qué repuestos podrían afectar una OT abierta?',
    ],
  },
  {
    domain: 'procurement',
    prefixes: ['/dashboard/compras'],
    label: 'Compras y Abastecimiento',
    title: 'Asistente de Compras',
    scopeHint: 'Parte desde órdenes, proveedores y recepciones; amplía sólo cuando existe una dependencia operacional.',
    capabilities: ['procurement'],
    suggestedPrompts: [
      '¿Qué órdenes de compra requieren atención?',
      '¿Cuál es el estado de las compras recientes?',
      '¿Qué compra podría estar bloqueando mantenimiento?',
    ],
  },
  {
    domain: 'production',
    prefixes: ['/dashboard/produccion', '/dashboard/andon', '/dashboard/daily-management'],
    label: 'Producción',
    title: 'Asistente de Producción',
    scopeHint: 'Parte desde producción y excepciones del turno; cruza otras áreas sólo para explicar una restricción.',
    capabilities: ['production'],
    suggestedPrompts: [
      '¿Qué requiere atención en producción?',
      '¿Qué excepciones explican el estado operacional?',
      '¿Hay señales que debamos contrastar con mantenimiento o inventario?',
    ],
  },
  {
    domain: 'finance',
    prefixes: ['/dashboard/finanzas', '/dashboard/centros-costos'],
    label: 'Finanzas',
    title: 'Asistente de Finanzas',
    scopeHint: 'Parte desde compromisos, costos y centros de costo dentro de los permisos del usuario.',
    capabilities: ['finance'],
    suggestedPrompts: [
      '¿Qué compromisos financieros requieren atención?',
      '¿Qué costos muestran una excepción relevante?',
      '¿Qué información falta para explicar esta variación?',
    ],
  },
  {
    domain: 'documents',
    prefixes: ['/dashboard/documentos', '/dashboard/documentos-gestion', '/dashboard/contratos'],
    label: 'Documentos y Contratos',
    title: 'Asistente de Documentos',
    scopeHint: 'Parte desde documentos, contratos y vencimientos visibles para el usuario.',
    capabilities: ['documents'],
    suggestedPrompts: [
      '¿Qué documentos requieren atención?',
      '¿Qué contratos o certificados están próximos a vencer?',
      '¿Qué evidencia documental falta para cerrar este caso?',
    ],
  },
  {
    domain: 'legal',
    prefixes: ['/dashboard/legal'],
    label: 'Legal',
    title: 'Asistente Legal MOTIL',
    scopeHint: 'Parte desde contratos, estados de pago, proveedores, cumplimiento, permisos y evidencia financiera visible para Legal.',
    capabilities: ['documents', 'finance'],
    suggestedPrompts: [
      '¿Qué contratos requieren atención hoy?',
      '¿Qué falta pagar y qué evidencia respalda ese estado?',
      '¿Qué proveedores o permisos tienen vencimientos pendientes?',
    ],
  },
  {
    domain: 'data_health',
    prefixes: ['/dashboard/calidad-datos', '/dashboard/auditoria-operacional'],
    label: 'Calidad de Datos',
    title: 'Asistente de Calidad de Datos',
    scopeHint: 'Parte desde frescura, cobertura y conflictos de fuente; nunca convierte ausencia de datos en una conclusión operacional.',
    capabilities: ['data_health'],
    suggestedPrompts: [
      '¿Qué fuentes requieren atención?',
      '¿Qué dato incompleto tiene mayor impacto operativo?',
      '¿Dónde hay conflictos de fuente que debamos revisar?',
    ],
  },
  {
    domain: 'executive',
    prefixes: ['/dashboard/decisiones', '/dashboard/acciones', '/dashboard/alertas'],
    label: 'Centro Ejecutivo',
    title: 'Asistente Senior MOTIL',
    scopeHint: 'Prioriza excepciones ejecutivas y usa análisis transversal sólo cuando agrega evidencia útil.',
    capabilities: ['executive_decisions', 'executive_escalations', 'data_health'],
    suggestedPrompts: [
      '¿Qué requiere atención de gerencia hoy?',
      '¿Cuáles son las tres prioridades operacionales y por qué?',
      '¿Qué restricción necesita una decisión transversal?',
    ],
  },
];

const HOME_CONTEXT: AssistantContext = {
  domain: 'executive',
  label: 'MOTIL',
  title: 'Asistente Senior MOTIL',
  scopeHint: 'Parte desde tu cargo y permisos efectivos, y amplía el análisis sólo hacia dominios autorizados cuando aporta evidencia útil.',
  capabilities: ['executive_decisions', 'executive_escalations', 'data_health'],
  suggestedPrompts: [
    '¿Qué requiere mi atención ahora?',
    '¿Cuáles son mis tres prioridades y qué evidencia las respalda?',
    '¿Qué está bloqueado y qué debería validar primero?',
  ],
};

const GLOBAL_CONTEXT: AssistantContext = {
  domain: 'global',
  label: 'MOTIL',
  title: 'Asistente Senior MOTIL',
  scopeHint: 'Parte desde el contexto actual y amplía el análisis sólo cuando la pregunta lo justifica.',
  capabilities: ['executive_decisions', 'data_health'],
  suggestedPrompts: [
    '¿Qué requiere atención hoy?',
    '¿Qué excepción debería revisar primero?',
    '¿Qué evidencia falta para tomar una mejor decisión?',
  ],
};

export function resolveAssistantContext(pathname: string): AssistantContext {
  const normalized = String(pathname || '').toLowerCase();
  if (normalized === '/dashboard' || normalized === '/dashboard/') return HOME_CONTEXT;
  const match = CONTEXTS.find((context) => context.prefixes.some((prefix) => normalized.startsWith(prefix)));
  if (!match) return GLOBAL_CONTEXT;
  const { prefixes: _prefixes, ...context } = match;
  return context;
}

export function isAssistantDomain(value: unknown): value is AssistantDomain {
  return ['global', 'maintenance', 'geology', 'inventory', 'procurement', 'production', 'finance', 'documents', 'legal', 'data_health', 'executive'].includes(String(value || ''));
}

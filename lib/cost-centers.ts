export interface CostCenterRecord {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: 'active' | 'inactive';
  activityEvents?: number;
  committedClp?: number;
}

const COLLATOR = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const ROOT_PRIORITY = [
  '01',
  '02',
  '03',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
];
const ROOT_PRIORITY_INDEX = new Map(ROOT_PRIORITY.map((code, index) => [code, index]));

function normalizeCode(code: string) {
  return String(code || '').trim();
}

export function normalizeStatusText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const TEXT_FIXES: Array<[RegExp, string]> = [
  [/exploracin/gi, 'exploracion'],
  [/explotacin/gi, 'explotacion'],
  [/administracin/gi, 'administracion'],
  [/mantencin/gi, 'mantencion'],
  [/perforacin/gi, 'perforacion'],
  [/carguio/gi, 'carguio'],
  [/desague/gi, 'desague'],
  [/mecnica/gi, 'mecanica'],
  [/planificacin/gi, 'planificacion'],
  [/geologa/gi, 'geologia'],
  [/sondaje/gi, 'sondaje'],
  [/topografa/gi, 'topografia'],
  [/recepcin/gi, 'recepcion'],
  [/supervisin/gi, 'supervision'],
  [/recepcion/gi, 'recepcion'],
  [/distribucin/gi, 'distribucion'],
  [/operacin/gi, 'operacion'],
  [/explotacion/gi, 'explotacion'],
  [/exploracion/gi, 'exploracion'],
  [/administracion/gi, 'administracion'],
  [/mantencion/gi, 'mantencion'],
  [/perforacion/gi, 'perforacion'],
  [/mecanica/gi, 'mecanica'],
  [/planificacion/gi, 'planificacion'],
  [/geologia/gi, 'geologia'],
  [/topografia/gi, 'topografia'],
  [/supervision/gi, 'supervision'],
];

export function repairCostCenterText(value: string) {
  let result = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [pattern, replacement] of TEXT_FIXES) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s+/g, ' ').trim();
}

export function isActiveCostCenterStatus(value: string | null | undefined) {
  const normalized = normalizeStatusText(value);
  return ['active', 'activo', 'vigente', 'enabled', 'habilitado', 'si', '1', 'true'].includes(normalized);
}

export function getCostCenterDepth(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return 0;
  return normalized.split('-').filter(Boolean).length - 1;
}

export function isRootCostCenter(code: string) {
  return getCostCenterDepth(code) === 0;
}

export function getCostCenterRootCode(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized.includes('-')) return normalized;
  return normalized.split('-')[0] || normalized;
}

export function shouldForceInactiveCostCenter(code: string) {
  const rootCode = getCostCenterRootCode(code);
  return /^0?[1-7]$/.test(rootCode);
}

export function isVisibleCostCenter(code: string) {
  const normalized = normalizeCode(code);
  return /^[0-9]/.test(normalized) && !shouldForceInactiveCostCenter(normalized);
}

export function getCostCenterPriority(code: string) {
  const rootCode = getCostCenterRootCode(code);
  const priority = ROOT_PRIORITY_INDEX.get(rootCode);
  return typeof priority === 'number' ? priority : Number.MAX_SAFE_INTEGER;
}

export function formatCostCenterLabel(costCenter: Pick<CostCenterRecord, 'code' | 'name'>) {
  return `${costCenter.code} - ${repairCostCenterText(costCenter.name)}`;
}

export function sortCostCenters<T extends Pick<CostCenterRecord, 'code' | 'name'>>(costCenters: T[]) {
  return [...costCenters].sort((a, b) => {
    const aPriority = getCostCenterPriority(a.code);
    const bPriority = getCostCenterPriority(b.code);

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    const aRoot = getCostCenterRootCode(a.code);
    const bRoot = getCostCenterRootCode(b.code);

    if (aRoot !== bRoot) {
      return COLLATOR.compare(aRoot, bRoot);
    }

    const depthDiff = getCostCenterDepth(a.code) - getCostCenterDepth(b.code);
    if (depthDiff !== 0) return depthDiff;

    const codeCompare = COLLATOR.compare(String(a.code || ''), String(b.code || ''));
    if (codeCompare !== 0) return codeCompare;

    return COLLATOR.compare(String(a.name || ''), String(b.name || ''));
  });
}

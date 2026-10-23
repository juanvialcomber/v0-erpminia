export type InventoryObservation = {
  source: 'motil_operational' | 'laudus_erp' | 'physical_count';
  quantity: number | null;
  unit: string | null;
  observedAt?: string | null;
};

export type InventoryTolerancePolicy = {
  absoluteTolerance: number;
  unit: string;
  approved: boolean;
};

export type InventoryReconciliationStatus =
  | 'identity_missing'
  | 'unit_conflict'
  | 'waiting_laudus'
  | 'aligned'
  | 'erp_difference'
  | 'operational_difference'
  | 'multi_source_conflict'
  | 'review_difference';

export type InventoryReconciliationDecision = {
  status: InventoryReconciliationStatus;
  toleranceApplied: number;
  autoApply: false;
  requiresReview: boolean;
  reasons: string[];
  deltas: {
    motilVsLaudus: number | null;
    motilVsPhysical: number | null;
    laudusVsPhysical: number | null;
  };
};

function normalizedUnit(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase();
}

function within(a: number | null, b: number | null, tolerance: number) {
  if (a == null || b == null) return null;
  return Math.abs(a - b) <= tolerance;
}

function delta(a: number | null, b: number | null) {
  if (a == null || b == null) return null;
  return a - b;
}

export function reconcileInventorySources(args: {
  hasResolvedIdentity: boolean;
  motil: InventoryObservation;
  laudus?: InventoryObservation | null;
  physical?: InventoryObservation | null;
  policy?: InventoryTolerancePolicy | null;
}): InventoryReconciliationDecision {
  const tolerance = args.policy?.approved
    ? Math.max(0, Number(args.policy.absoluteTolerance || 0))
    : 0;

  const resultBase = {
    toleranceApplied: tolerance,
    autoApply: false as const,
    deltas: {
      motilVsLaudus: delta(args.motil.quantity, args.laudus?.quantity ?? null),
      motilVsPhysical: delta(args.motil.quantity, args.physical?.quantity ?? null),
      laudusVsPhysical: delta(args.laudus?.quantity ?? null, args.physical?.quantity ?? null),
    },
  };

  if (!args.hasResolvedIdentity) {
    return {
      ...resultBase,
      status: 'identity_missing',
      requiresReview: true,
      reasons: ['Producto o bodega sin identidad reconciliada.'],
    };
  }

  const units = [
    normalizedUnit(args.motil.unit),
    normalizedUnit(args.laudus?.unit),
    normalizedUnit(args.physical?.unit),
  ].filter(Boolean);

  const uniqueUnits = new Set(units);
  if (uniqueUnits.size > 1) {
    return {
      ...resultBase,
      status: 'unit_conflict',
      requiresReview: true,
      reasons: ['Las fuentes usan unidades distintas.'],
    };
  }

  if (!args.laudus || args.laudus.quantity == null) {
    return {
      ...resultBase,
      status: 'waiting_laudus',
      requiresReview: false,
      reasons: ['Aún no existe saldo Laudus sincronizado.'],
    };
  }

  const motilVsLaudus = within(args.motil.quantity, args.laudus.quantity, tolerance);

  if (!args.physical || args.physical.quantity == null) {
    if (motilVsLaudus === true) {
      return {
        ...resultBase,
        status: 'aligned',
        requiresReview: false,
        reasons: [],
      };
    }

    return {
      ...resultBase,
      status: 'review_difference',
      requiresReview: true,
      reasons: ['Saldo MOTIL y saldo Laudus difieren. No existe conteo físico para resolver la diferencia.'],
    };
  }

  const motilVsPhysical = within(args.motil.quantity, args.physical.quantity, tolerance);
  const laudusVsPhysical = within(args.laudus.quantity, args.physical.quantity, tolerance);

  if (motilVsLaudus && motilVsPhysical && laudusVsPhysical) {
    return {
      ...resultBase,
      status: 'aligned',
      requiresReview: false,
      reasons: [],
    };
  }

  if (motilVsPhysical && !laudusVsPhysical) {
    return {
      ...resultBase,
      status: 'erp_difference',
      requiresReview: true,
      reasons: ['MOTIL coincide con conteo físico y Laudus difiere.'],
    };
  }

  if (laudusVsPhysical && !motilVsPhysical) {
    return {
      ...resultBase,
      status: 'operational_difference',
      requiresReview: true,
      reasons: ['Laudus coincide con conteo físico y MOTIL difiere.'],
    };
  }

  return {
    ...resultBase,
    status: 'multi_source_conflict',
    requiresReview: true,
    reasons: ['MOTIL, Laudus y conteo físico no concilian dentro de la tolerancia aprobada.'],
  };
}

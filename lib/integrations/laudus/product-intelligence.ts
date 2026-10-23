export type LaudusProductRecord = {
  productId?: number | string | null;
  SKU?: string | null;
  description?: string | null;
  unitOfMeasure?: string | null;
};

export type LaudusProductCategory =
  | 'maintenance_supply'
  | 'safety_supply'
  | 'process_consumable'
  | 'fixed_asset'
  | 'service'
  | 'general_supply'
  | 'other';

export type LaudusProductTarget =
  | 'warehouse'
  | 'maintenance'
  | 'hse'
  | 'plant_lab'
  | 'asset_360'
  | 'procurement';

export type LaudusInventoryEligibility = 'eligible' | 'review' | 'exclude';

export type LaudusProductIntelligence = {
  category: LaudusProductCategory;
  sourcePrefix: string | null;
  inventoryEligibility: LaudusInventoryEligibility;
  targets: LaudusProductTarget[];
  confidence: number;
  qualityFlags: string[];
  reasons: string[];
};

type Rule = {
  category: LaudusProductCategory;
  inventoryEligibility: LaudusInventoryEligibility;
  targets: LaudusProductTarget[];
  confidence: number;
  reason: string;
};

const RULES: Record<string, Rule> = {

  FITTING: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.98,
    reason: 'SKU Laudus identifica fitting o conexión operacional.',
  },
  PERFORACION: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.97,
    reason: 'SKU Laudus identifica material o componente de perforación.',
  },
  CORREA: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.98,
    reason: 'SKU Laudus identifica correa o componente de transmisión.',
  },
  SOLDADURA: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.98,
    reason: 'SKU Laudus identifica insumo de soldadura.',
  },
  CORAZA: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.97,
    reason: 'SKU Laudus identifica coraza o componente de desgaste.',
  },
  MADERA: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.9,
    reason: 'SKU Laudus identifica material de madera de uso operacional.',
  },
  FORTIFICACION: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.96,
    reason: 'SKU Laudus identifica material de fortificación.',
  },
  MALLA: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.9,
    reason: 'SKU Laudus identifica malla de uso operacional.',
  },
  CINTA: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.9,
    reason: 'SKU Laudus identifica cinta de uso operacional.',
  },
  LONA: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.9,
    reason: 'SKU Laudus identifica lona de uso operacional.',
  },
  BOLA: {
    category: 'process_consumable',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'plant_lab', 'procurement'],
    confidence: 0.92,
    reason: 'SKU Laudus identifica medio o consumible de proceso.',
  },
  SERVTEC: {
    category: 'service',
    inventoryEligibility: 'exclude',
    targets: ['procurement'],
    confidence: 0.98,
    reason: 'SKU Laudus identifica servicio técnico.',
  },
  EXPLOSIVO: {
    category: 'process_consumable',
    inventoryEligibility: 'review',
    targets: ['hse', 'procurement'],
    confidence: 0.98,
    reason: 'SKU Laudus identifica explosivo; requiere tratamiento especial y revisión humana.',
  },
  COMBUSTIBLE: {
    category: 'process_consumable',
    inventoryEligibility: 'review',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.95,
    reason: 'SKU Laudus identifica combustible; requiere política operacional específica.',
  },

  REPUESTO: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica un repuesto.',
  },
  FILTRO: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica un filtro.',
  },
  FERRETERIA: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.97,
    reason: 'SKU Laudus identifica ferretería operacional.',
  },
  ELECTRICO: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.97,
    reason: 'SKU Laudus identifica material eléctrico.',
  },
  ACERO: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.96,
    reason: 'SKU Laudus identifica material de acero.',
  },
  LUBRICANTE: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica lubricante.',
  },
  RODAMIENTO: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica rodamiento.',
  },
  BOMBA: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.96,
    reason: 'SKU Laudus identifica bomba o componente asociado.',
  },
  NEUMATICO: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica neumático.',
  },
  COMPO: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.9,
    reason: 'SKU Laudus identifica componente operacional.',
  },
  SONDAJE: {
    category: 'maintenance_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'maintenance', 'procurement'],
    confidence: 0.97,
    reason: 'SKU Laudus identifica material o repuesto de sondaje.',
  },
  EPP: {
    category: 'safety_supply',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'hse', 'procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica elemento de protección personal.',
  },
  REACTIVO: {
    category: 'process_consumable',
    inventoryEligibility: 'eligible',
    targets: ['warehouse', 'plant_lab', 'procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica reactivo o consumible de proceso/laboratorio.',
  },
  ACTIVOFIJO: {
    category: 'fixed_asset',
    inventoryEligibility: 'exclude',
    targets: ['asset_360', 'procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica un activo fijo; no debe tratarse como stock por defecto.',
  },
  SERVI: {
    category: 'service',
    inventoryEligibility: 'exclude',
    targets: ['procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica un servicio; no corresponde a inventario físico.',
  },
  SERVICIO: {
    category: 'service',
    inventoryEligibility: 'exclude',
    targets: ['procurement'],
    confidence: 0.99,
    reason: 'SKU Laudus identifica un servicio; no corresponde a inventario físico.',
  },
  ESCRITORIO: {
    category: 'general_supply',
    inventoryEligibility: 'review',
    targets: ['warehouse', 'procurement'],
    confidence: 0.94,
    reason: 'SKU Laudus identifica suministro general; requiere política de bodega.',
  },
  VIVERES: {
    category: 'general_supply',
    inventoryEligibility: 'review',
    targets: ['warehouse', 'procurement'],
    confidence: 0.94,
    reason: 'SKU Laudus identifica víveres; requiere política de bodega.',
  },
  OTROS: {
    category: 'other',
    inventoryEligibility: 'review',
    targets: ['procurement'],
    confidence: 0.75,
    reason: 'Categoría Laudus genérica; requiere resolución antes de adoptar.',
  },
};

function asciiUpper(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function laudusSkuPrefix(value: unknown): string | null {
  const normalized = asciiUpper(value);
  if (!normalized) return null;
  const match = normalized.match(/^[A-Z]+/);
  return match?.[0] || null;
}

function productQualityFlags(product: LaudusProductRecord) {
  const flags: string[] = [];
  const sku = String(product.SKU ?? '').trim();
  const description = String(product.description ?? '').trim();
  const unit = String(product.unitOfMeasure ?? '').trim();

  if (!sku) flags.push('missing_sku');
  if (!description) flags.push('missing_description');
  if (!unit || unit === '0') flags.push('invalid_or_missing_unit');

  const normalizedDescription = asciiUpper(description);
  if (
    normalizedDescription.includes('GENERICO DE SERVICIO') ||
    normalizedDescription === 'DISPONIBLE' ||
    normalizedDescription.includes('CAMBIAR DESCRIPCION')
  ) {
    flags.push('generic_or_placeholder_description');
  }

  return flags;
}

export function classifyLaudusProduct(
  product: LaudusProductRecord,
): LaudusProductIntelligence {
  const sourcePrefix = laudusSkuPrefix(product.SKU);
  const rule = sourcePrefix ? RULES[sourcePrefix] : undefined;
  const qualityFlags = productQualityFlags(product);

  if (!rule) {
    return {
      category: 'other',
      sourcePrefix,
      inventoryEligibility: 'review',
      targets: ['procurement'],
      confidence: sourcePrefix ? 0.6 : 0.3,
      qualityFlags,
      reasons: [
        sourcePrefix
          ? `Prefijo Laudus ${sourcePrefix} aún no tiene regla operacional MOTIL.`
          : 'SKU sin prefijo clasificable.',
      ],
    };
  }

  return {
    category: rule.category,
    sourcePrefix,
    inventoryEligibility: qualityFlags.includes('missing_sku') ? 'review' : rule.inventoryEligibility,
    targets: rule.targets,
    confidence: rule.confidence,
    qualityFlags,
    reasons: [rule.reason],
  };
}

export function summarizeLaudusProducts(products: LaudusProductRecord[]) {
  const categoryCounts: Record<string, number> = {};
  const eligibilityCounts: Record<string, number> = {};
  const prefixCounts: Record<string, number> = {};
  const qualityFlagCounts: Record<string, number> = {};
  const samples: Record<string, Array<Record<string, unknown>>> = {
    eligible: [],
    review: [],
    exclude: [],
  };

  for (const product of products) {
    const intelligence = classifyLaudusProduct(product);
    categoryCounts[intelligence.category] = (categoryCounts[intelligence.category] || 0) + 1;
    eligibilityCounts[intelligence.inventoryEligibility] =
      (eligibilityCounts[intelligence.inventoryEligibility] || 0) + 1;

    const prefix = intelligence.sourcePrefix || 'SIN_PREFIJO';
    prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;

    for (const flag of intelligence.qualityFlags) {
      qualityFlagCounts[flag] = (qualityFlagCounts[flag] || 0) + 1;
    }

    const bucket = samples[intelligence.inventoryEligibility];
    if (bucket.length < 12) {
      bucket.push({
        productId: product.productId ?? null,
        SKU: product.SKU ?? null,
        description: product.description ?? null,
        unitOfMeasure: product.unitOfMeasure ?? null,
        category: intelligence.category,
        sourcePrefix: intelligence.sourcePrefix,
        targets: intelligence.targets,
        confidence: intelligence.confidence,
        qualityFlags: intelligence.qualityFlags,
      });
    }
  }

  const sortedPrefixes = Object.entries(prefixCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([prefix, count]) => ({ prefix, count }));

  return {
    total: products.length,
    categoryCounts,
    eligibilityCounts,
    prefixCounts: sortedPrefixes,
    qualityFlagCounts,
    samples,
  };
}

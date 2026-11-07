export type LegalProgressInvoiceSource = {
  docNumber: string;
  sourceAmount: number;
  retentionAmount: number;
  sourceText: string;
};

export type LegalProgressMilestoneSource = {
  contractNumber: 'IO-01' | 'IO-02' | 'IO-03' | 'IO-04' | 'IO-05' | 'IO-06' | 'IO-07' | 'IO-08' | 'IO-09' | 'EP-02' | 'EP-03';
  sequence: number;
  title: string;
  purchaseOrderNumber: string;
  currency: 'CLP' | 'USD' | 'UF';
  totalAmount: number;
  progressRatio: number;
  executedAmount: number;
  invoicedAmount: number;
  pendingToInvoice: number;
  invoices: LegalProgressInvoiceSource[];
  sourceSheet: string;
  sourceRow: number;
};

export const LEGAL_PROGRESS_SOURCE_FILE = 'Planilla Avance Contratos - Con resumen.xlsx';
export const LEGAL_PROGRESS_SOURCE_SHA256 = 'b7eb275ec0b86e5867ece489a714c48a09033342403deb65fd719ad9c9c29317';

export type LegalContractSourceMeta = {
  startDate: string | null;
  endDate: string | null;
  sourceSheet: string;
  note?: string;
};

export const LEGAL_CONTRACT_SOURCE_META: Partial<Record<LegalProgressMilestoneSource['contractNumber'], LegalContractSourceMeta>> = {
  'IO-01': { startDate: '2026-04-20', endDate: '2027-06-14', sourceSheet: 'Control Contrato RPR Fase 1' },
  'IO-02': { startDate: '2026-09-08', endDate: null, sourceSheet: 'Control Contrato RPR Fase 1 Mon', note: 'Fecha de término no informada en la hoja fuente.' },
  'IO-03': { startDate: null, endDate: null, sourceSheet: 'RPR Suministro Ss Leasing', note: 'Fechas fuente no utilizables (valor cero).' },
  'IO-04': { startDate: '2026-05-13', endDate: null, sourceSheet: 'Control SL Ingeniería', note: 'Fecha de término fuente no utilizable.' },
  'IO-05': { startDate: '2026-04-20', endDate: '2026-07-31', sourceSheet: 'Control Contrato Petra' },
  'IO-06': { startDate: '2025-07-21', endDate: '2026-07-31', sourceSheet: 'CONTROL SERV MINERÍA y ENERGÍA ' },
  'IO-07': { startDate: '2026-02-09', endDate: '2026-08-31', sourceSheet: 'GEOPHYSICAL STUDIES ', note: 'Fecha término corresponde al último proyecto estructurado de la hoja.' },
  'IO-08': { startDate: '2026-04-27', endDate: '2026-07-31', sourceSheet: 'CONSTRUCTORA 3D SPA' },
  'IO-09': { startDate: '2026-03-19', endDate: '2026-10-31', sourceSheet: 'SPIN TECHNOLOGIES Leasing' },
  'EP-02': { startDate: '2026-05-15', endDate: '2026-08-31', sourceSheet: 'Global Fire' },
  'EP-03': { startDate: '2026-05-04', endDate: '2026-12-31', sourceSheet: 'Sustentable' },
};

export const LEGAL_PROGRESS_MILESTONES: LegalProgressMilestoneSource[] = [
  {
    contractNumber: 'IO-01', sequence: 1, title: 'Trabajos Preliminares', purchaseOrderNumber: '27712',
    currency: 'CLP', totalAmount: 27830000, progressRatio: 0.84, executedAmount: 23377200,
    invoicedAmount: 23377200, pendingToInvoice: 4452800,
    invoices: [
      { docNumber: '17', sourceAmount: 5566000, retentionAmount: 331177, sourceText: 'F-17 01-04-26 20%' },
      { docNumber: '28', sourceAmount: 13358400, retentionAmount: 667920, sourceText: 'F-28 24-05-26 48%' },
      { docNumber: '34', sourceAmount: 2226400, retentionAmount: 111320, sourceText: 'F-34 08-07-26 8%' },
      { docNumber: '51', sourceAmount: 2226400, retentionAmount: 111320, sourceText: 'F-51 15-09-26 8%' },
    ],
    sourceSheet: 'Control Contrato RPR Fase 1', sourceRow: 12,
  },
  {
    contractNumber: 'IO-01', sequence: 2, title: 'Muro de Contención molienda molinos 1 y 2', purchaseOrderNumber: '27714',
    currency: 'CLP', totalAmount: 223228800, progressRatio: 0.7759371038066657, executedAmount: 149332772.59584,
    invoicedAmount: 149332773, pendingToInvoice: 73896027.40416,
    invoices: [
      { docNumber: '18', sourceAmount: 44645760, retentionAmount: 2656422.72, sourceText: 'F-18 01-04-26' },
      { docNumber: '29', sourceAmount: 6003464, retentionAmount: 300173.2, sourceText: 'F-29 27-05-26' },
      { docNumber: '35', sourceAmount: 9484826, retentionAmount: 474241.3, sourceText: 'F-35 08-07-26' },
      { docNumber: '39', sourceAmount: 44239364, retentionAmount: 2211968.2, sourceText: 'F-39 04-08-26' },
      { docNumber: '50', sourceAmount: 18100364, retentionAmount: 905018.2, sourceText: 'F-50 15-09-26' },
      { docNumber: '52', sourceAmount: 26858995, retentionAmount: 1342949.75, sourceText: 'F-52 22-09-26' },
    ],
    sourceSheet: 'Control Contrato RPR Fase 1', sourceRow: 27,
  },
  {
    contractNumber: 'IO-01', sequence: 3, title: "Fundación Molino 9' x 12' Nº 1", purchaseOrderNumber: '27754',
    currency: 'CLP', totalAmount: 243236270, progressRatio: 0.22305070403357194, executedAmount: 61868344,
    invoicedAmount: 61868344, pendingToInvoice: 181367926,
    invoices: [
      { docNumber: '30', sourceAmount: 48647254, retentionAmount: 2432362.7, sourceText: 'F-30 08-06-26 20%' },
      { docNumber: '40', sourceAmount: 13221090, retentionAmount: 661054.5, sourceText: 'F-40 04-08-26' },
    ],
    sourceSheet: 'Control Contrato RPR Fase 1', sourceRow: 47,
  },
  {
    contractNumber: 'IO-01', sequence: 4, title: "Excavaciones y rellenos compactados Molinos 9' x 12' Nº 1 y 2", purchaseOrderNumber: '27752',
    currency: 'CLP', totalAmount: 13575750, progressRatio: 0, executedAmount: 0, invoicedAmount: 0,
    pendingToInvoice: 13575750, invoices: [], sourceSheet: 'Control Contrato RPR Fase 1', sourceRow: 67,
  },
  {
    contractNumber: 'IO-01', sequence: 5, title: 'Túnel stock Pile (2 Unidades)', purchaseOrderNumber: '27755',
    currency: 'CLP', totalAmount: 90717750, progressRatio: 0, executedAmount: 0, invoicedAmount: 0,
    pendingToInvoice: 90717750, invoices: [], sourceSheet: 'Control Contrato RPR Fase 1', sourceRow: 81,
  },
  {
    contractNumber: 'IO-01', sequence: 6, title: "Fundación Molino 9' x 12' Nº 2", purchaseOrderNumber: '27756',
    currency: 'CLP', totalAmount: 243236270, progressRatio: 0.21653471781044117, executedAmount: 57341254,
    invoicedAmount: 57341254, pendingToInvoice: 185895016,
    invoices: [
      { docNumber: '42', sourceAmount: 48647254, retentionAmount: 2432362.7, sourceText: 'F-42 05-08-2026 20%' },
      { docNumber: '41', sourceAmount: 8694000, retentionAmount: 434700, sourceText: 'F-41 04-08-2026' },
    ],
    sourceSheet: 'Control Contrato RPR Fase 1', sourceRow: 97,
  },
  {
    contractNumber: 'IO-01', sequence: 7, title: 'Fundación torre de ciclones', purchaseOrderNumber: '27757',
    currency: 'CLP', totalAmount: 17468500, progressRatio: 0, executedAmount: 0, invoicedAmount: 0,
    pendingToInvoice: 17468500, invoices: [], sourceSheet: 'Control Contrato RPR Fase 1', sourceRow: 117,
  },
  {
    contractNumber: 'IO-02', sequence: 1, title: "Montaje Molino 9' x 12' Nº 1", purchaseOrderNumber: '29501',
    currency: 'CLP', totalAmount: 137798750, progressRatio: 0, executedAmount: 0, invoicedAmount: 0,
    pendingToInvoice: 137798750, invoices: [], sourceSheet: 'Control Contrato RPR Fase 1 Mon', sourceRow: 12,
  },
  {
    contractNumber: 'IO-02', sequence: 2, title: "Montaje Molino 9' x 12' Nº 2", purchaseOrderNumber: '29502',
    currency: 'CLP', totalAmount: 137798750, progressRatio: 0, executedAmount: 0, invoicedAmount: 0,
    pendingToInvoice: 137798750, invoices: [], sourceSheet: 'Control Contrato RPR Fase 1 Mon', sourceRow: 41,
  },
  {
    contractNumber: 'IO-02', sequence: 3, title: 'Torre de ciclones', purchaseOrderNumber: '29503',
    currency: 'CLP', totalAmount: 85406475, progressRatio: 0.2, executedAmount: 17081295,
    invoicedAmount: 17081295, pendingToInvoice: 68325180,
    invoices: [
      { docNumber: '55', sourceAmount: 17081295, retentionAmount: 854064.75, sourceText: 'F-55' },
    ],
    sourceSheet: 'Control Contrato RPR Fase 1 Mon', sourceRow: 71,
  },
  {
    contractNumber: 'IO-02', sequence: 4, title: "Complementos Molino 9' x 12' Nº 1 y 2", purchaseOrderNumber: '29505',
    currency: 'CLP', totalAmount: 116207500, progressRatio: 0, executedAmount: 0, invoicedAmount: 0,
    pendingToInvoice: 116207500, invoices: [], sourceSheet: 'Control Contrato RPR Fase 1 Mon', sourceRow: 90,
  },
  {
    contractNumber: 'IO-02', sequence: 5, title: 'Sistema eléctrico - Acometidas (Estimadas)', purchaseOrderNumber: '29507',
    currency: 'CLP', totalAmount: 159275000, progressRatio: 0, executedAmount: 0, invoicedAmount: 0,
    pendingToInvoice: 159275000, invoices: [], sourceSheet: 'Control Contrato RPR Fase 1 Mon', sourceRow: 111,
  },
  {
    contractNumber: 'IO-02', sequence: 6, title: 'Sistema eléctrico - Acometidas (Estimadas)', purchaseOrderNumber: '28693',
    currency: 'CLP', totalAmount: 164450000, progressRatio: 0.36503496503400007, executedAmount: 60030000,
    invoicedAmount: 60030000, pendingToInvoice: 104420000,
    invoices: [
      { docNumber: '31', sourceAmount: 38000000, retentionAmount: 0, sourceText: 'F-31 17-06-26' },
      { docNumber: '48', sourceAmount: 22030000, retentionAmount: 1101500, sourceText: 'F-48 08-09-26' },
    ],
    sourceSheet: 'Control Contrato RPR Fase 1 Mon', sourceRow: 126,
  },
  {
    contractNumber: 'IO-02', sequence: 7, title: "Puesta en Marcha Molino 9' x 12' Nº 1 y 2", purchaseOrderNumber: '29508',
    currency: 'CLP', totalAmount: 19550000, progressRatio: 0, executedAmount: 0, invoicedAmount: 0,
    pendingToInvoice: 19550000, invoices: [], sourceSheet: 'Control Contrato RPR Fase 1 Mon', sourceRow: 140,
  },
  {
    contractNumber: 'IO-02', sequence: 8, title: 'Montaje de chancador terciario mecánico estructural', purchaseOrderNumber: '29513',
    currency: 'CLP', totalAmount: 55775000, progressRatio: 0, executedAmount: 0, invoicedAmount: 0,
    pendingToInvoice: 55775000, invoices: [], sourceSheet: 'Control Contrato RPR Fase 1 Mon', sourceRow: 153,
  },
  {
    contractNumber: 'IO-03', sequence: 1, title: 'Suministro equipos Molino 9 x 12 N° 1 y 2', purchaseOrderNumber: '27602',
    currency: 'CLP', totalAmount: 149500000, progressRatio: 0.2, executedAmount: 29900000,
    invoicedAmount: 0, pendingToInvoice: 119600000, invoices: [],
    sourceSheet: 'RPR Suministro Ss Leasing', sourceRow: 18,
  },
  {
    contractNumber: 'IO-03', sequence: 2, title: 'Suministro cintas transportadoras 24 pies', purchaseOrderNumber: '27604',
    currency: 'CLP', totalAmount: 299460000, progressRatio: 0.2, executedAmount: 59892000,
    invoicedAmount: 0, pendingToInvoice: 239568000, invoices: [],
    sourceSheet: 'RPR Suministro Ss Leasing', sourceRow: 36,
  },
  {
    contractNumber: 'IO-04', sequence: 1, title: 'Construcción Galpón 20x42x6 - cubierta techo y lateral', purchaseOrderNumber: '27849',
    currency: 'CLP', totalAmount: 105000000, progressRatio: 0.35, executedAmount: 36750000,
    invoicedAmount: 36750000, pendingToInvoice: 68250000,
    invoices: [{ docNumber: '494', sourceAmount: 36750000, retentionAmount: 0, sourceText: 'F-494' }],
    sourceSheet: 'Control SL Ingeniería', sourceRow: 13,
  },
  {
    contractNumber: 'IO-05', sequence: 1, title: 'Base Bodega - conjunto de órdenes de compra', purchaseOrderNumber: '27868 / 28099 / 28993 / 28995',
    currency: 'CLP', totalAmount: 107311515.872, progressRatio: 1, executedAmount: 107311515.872,
    invoicedAmount: 107311516, pendingToInvoice: -0.12800000607967377,
    invoices: [
      { docNumber: '2', sourceAmount: 10000000, retentionAmount: 0, sourceText: 'F-2 12-05-26' },
      { docNumber: '3', sourceAmount: 20000000, retentionAmount: 1000000, sourceText: 'F-3 26-05-26' },
      { docNumber: '5', sourceAmount: 14900000, retentionAmount: 745000, sourceText: 'F-5 24-06-26' },
      { docNumber: '7', sourceAmount: 26800000, retentionAmount: 1340000, sourceText: 'F-7 13-07-26' },
      { docNumber: '8', sourceAmount: 16056227, retentionAmount: 802811.35, sourceText: 'F-8 27-07-26' },
      { docNumber: '10', sourceAmount: 10731152, retentionAmount: 536557.6, sourceText: 'F-10 13-08-26' },
      { docNumber: '11', sourceAmount: 8824137, retentionAmount: 441206.85, sourceText: 'F-11 04-09-26' },
    ],
    sourceSheet: 'Control Contrato Petra', sourceRow: 137,
  },
  {
    contractNumber: 'IO-06', sequence: 1, title: 'Contrato marco eficiencia energética y descarbonización', purchaseOrderNumber: '25669 / 26770 / 27751',
    currency: 'CLP', totalAmount: 10950000, progressRatio: 0.7857142857142857, executedAmount: 8955000,
    invoicedAmount: 8330000, pendingToInvoice: 1995000,
    invoices: [
      { docNumber: '14', sourceAmount: 1817500, retentionAmount: 0, sourceText: 'F-14' },
      { docNumber: '19', sourceAmount: 1817500, retentionAmount: 0, sourceText: 'F-19' },
      { docNumber: '23', sourceAmount: 2325000, retentionAmount: 0, sourceText: 'F-23' },
      { docNumber: '32', sourceAmount: 1185000, retentionAmount: 0, sourceText: 'F-32' },
      { docNumber: '35', sourceAmount: 1185000, retentionAmount: 0, sourceText: 'F-35' },
    ],
    sourceSheet: 'CONTROL SERV MINERÍA y ENERGÍA ', sourceRow: 28,
  },
  {
    contractNumber: 'IO-06', sequence: 2, title: 'Diagramas Unilineales Planta', purchaseOrderNumber: '28072',
    currency: 'CLP', totalAmount: 2111611, progressRatio: 0.5, executedAmount: 1055805.5,
    invoicedAmount: 1055805.5, pendingToInvoice: 1055805.5,
    invoices: [{ docNumber: '34', sourceAmount: 1055805.5, retentionAmount: 0, sourceText: 'F-34' }],
    sourceSheet: 'CONTROL SERV MINERÍA y ENERGÍA ', sourceRow: 47,
  },
  {
    contractNumber: 'IO-06', sequence: 3, title: 'Normalización eléctrica faena Peumo y Don Jaime', purchaseOrderNumber: '28167',
    currency: 'CLP', totalAmount: 14810852, progressRatio: 0.6, executedAmount: 8886511.2,
    invoicedAmount: 8886511.4, pendingToInvoice: 5924340.8,
    invoices: [
      { docNumber: '36', sourceAmount: 2962170.4, retentionAmount: 0, sourceText: 'F-36' },
      { docNumber: '38', sourceAmount: 5924341, retentionAmount: 0, sourceText: 'F-38' },
    ],
    sourceSheet: 'CONTROL SERV MINERÍA y ENERGÍA ', sourceRow: 66,
  },
  {
    contractNumber: 'IO-06', sequence: 4, title: 'Desarrollo de ingeniería eléctrica Planta Minera La Patagua', purchaseOrderNumber: '28822',
    currency: 'CLP', totalAmount: 18000000, progressRatio: 0.3333333333333333, executedAmount: 3600000,
    invoicedAmount: 3600000, pendingToInvoice: 14400000,
    invoices: [{ docNumber: '40', sourceAmount: 3600000, retentionAmount: 180000, sourceText: 'F-40' }],
    sourceSheet: 'CONTROL SERV MINERÍA y ENERGÍA ', sourceRow: 87,
  },
  {
    contractNumber: 'IO-07', sequence: 1, title: 'Levantamiento geofísico Chaparro', purchaseOrderNumber: '27091',
    currency: 'CLP', totalAmount: 41580000, progressRatio: 0.5, executedAmount: 20790000,
    invoicedAmount: 20790000, pendingToInvoice: 20790000, invoices: [],
    sourceSheet: 'GEOPHYSICAL STUDIES ', sourceRow: 24,
  },
  {
    contractNumber: 'IO-07', sequence: 2, title: 'Levantamiento geofísico Elsa, Ánimas, Greda, Pataguita y Mantos', purchaseOrderNumber: '28402',
    currency: 'CLP', totalAmount: 49480000, progressRatio: 0.5, executedAmount: 24740000,
    invoicedAmount: 24740000, pendingToInvoice: 24740000, invoices: [],
    sourceSheet: 'GEOPHYSICAL STUDIES ', sourceRow: 52,
  },
  {
    contractNumber: 'IO-08', sequence: 1, title: 'Construcción muestrera, laboratorio y baños planta', purchaseOrderNumber: '27865 / 27939 / 27940 / 27943 / 27949 / 28071',
    currency: 'CLP', totalAmount: 93174633, progressRatio: 0.7577775811339536, executedAmount: 70605646.8713333,
    invoicedAmount: 70604875, pendingToInvoice: 22568988.528239697,
    invoices: [
      { docNumber: '29', sourceAmount: 12116676, retentionAmount: 605833.8, sourceText: 'F-29' },
      { docNumber: '30', sourceAmount: 11495059, retentionAmount: 574752.95, sourceText: 'F-30' },
      { docNumber: '31', sourceAmount: 15721770, retentionAmount: 786088.5, sourceText: 'F-31' },
      { docNumber: '32', sourceAmount: 19507740, retentionAmount: 975387, sourceText: 'F-32' },
      { docNumber: '33', sourceAmount: 3415499, retentionAmount: 170774.95, sourceText: 'F-33' },
      { docNumber: '34', sourceAmount: 8348131, retentionAmount: 417406.55, sourceText: 'F-34' },
    ],
    sourceSheet: 'CONSTRUCTORA 3D SPA', sourceRow: 228,
  },
  {
    contractNumber: 'IO-09', sequence: 1, title: 'Chancadores cono HC300, molinos 9 x 12 y bombas', purchaseOrderNumber: '27574',
    currency: 'USD', totalAmount: 1588826, progressRatio: 0.4, executedAmount: 635530.4,
    invoicedAmount: 0, pendingToInvoice: 953295.6, invoices: [],
    sourceSheet: 'SPIN TECHNOLOGIES Leasing', sourceRow: 20,
  },
  {
    contractNumber: 'EP-02', sequence: 1, title: 'Proyecto de peralte de tranque de relaves', purchaseOrderNumber: '28341',
    currency: 'UF', totalAmount: 953.59, progressRatio: 0.5, executedAmount: 476.795,
    invoicedAmount: 476.8, pendingToInvoice: 476.795,
    invoices: [
      { docNumber: '572', sourceAmount: 238.4, retentionAmount: 0, sourceText: 'F-572 · monto fuente en UF; retención informada en CLP no se mezcla' },
      { docNumber: '608', sourceAmount: 238.4, retentionAmount: 0, sourceText: 'F-608 · monto fuente en UF; retención informada en CLP no se mezcla' },
    ],
    sourceSheet: 'Global Fire', sourceRow: 18,
  },
  {
    contractNumber: 'EP-03', sequence: 1, title: 'DIA Proyecto Regularización Planta de Procesamiento La Patagua', purchaseOrderNumber: '28399 / 28488 / 28489 / 28490',
    currency: 'UF', totalAmount: 3296, progressRatio: 0.25, executedAmount: 824,
    invoicedAmount: 829.6, pendingToInvoice: 2472,
    invoices: [
      { docNumber: '2220', sourceAmount: 329.6, retentionAmount: 0, sourceText: 'F-2220 10% · monto fuente en UF; retención informada en CLP no se mezcla' },
      { docNumber: '2330', sourceAmount: 500, retentionAmount: 0, sourceText: 'F-2330 15% · monto fuente en UF; retención informada en CLP no se mezcla' },
    ],
    sourceSheet: 'Sustentable', sourceRow: 67,
  }
];

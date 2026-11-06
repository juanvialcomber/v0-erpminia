export type LegalProgressInvoiceSource = {
  docNumber: string;
  sourceAmount: number;
  retentionAmount: number;
  sourceText: string;
};

export type LegalProgressMilestoneSource = {
  contractNumber: 'IO-01' | 'IO-02';
  sequence: number;
  title: string;
  purchaseOrderNumber: string;
  currency: 'CLP';
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
];

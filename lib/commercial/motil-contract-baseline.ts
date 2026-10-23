export const MOTIL_CONTRACT_BASELINE = {
  sourceStatus: {
    proposal: 'proposal_sent_to_daniel',
    contract: 'draft_sent_for_review',
    signedFinalLocated: false,
    note: 'La copia contractual encontrada en Gmail mantiene placeholders del Cliente. No tratarla como versión final firmada hasta localizar el documento ejecutado.',
  },
  sourceReferences: [{
    type: 'email',
    subject: 'Administración - Plataforma La Patagua',
    sentAt: '2026-05-04',
    recipient: 'danielvillarroel@lapatagua.cl',
    attachments: ['20260423LaPataguaSeguria VF.pdf','Contrato Prestación de Servicios - ERP La Patagua.docx'],
  }],
  explicitContract: {
    modules: ['Mantención y maquinaria','Inventario','Gestión documental'],
    services: ['Diagnóstico de procesos','Desarrollo ERP a medida','Implementación y capacitación','Soporte','Asesoría técnica y continuidad operacional'],
    developmentNetClp: 24000000,
    stages: [
      { name: 'Etapa 1', netClp: 7200000, milestone: 'Firma del acuerdo' },
      { name: 'Etapa 2', netClp: 9600000, milestone: 'Fin del mes 3' },
      { name: 'Etapa 3', netClp: 7200000, milestone: 'Fin del mes 7' },
    ],
    monthlySupportNetClp: 1000000,
    term: '1 año, renovable mes a mes',
    supportSla: { responseHoursBusinessTime: 12, onsiteBusinessDaysIfNeeded: 3 },
  },
  commercialProposal: {
    implementationMonths: 7,
    paymentSplitPct: [30,40,30],
    functionalAreas: ['Operaciones','Mantenimiento','Inventarios','Reportes e indicadores','Cumplimiento','Personas','Seguridad','Medioambiente','Integraciones','Acceso multiplataforma'],
    keyDeliverables: ['Sistema operativo y configurado','500 documentos indexados','Usuarios capacitados','Reportes de métricas y resultados','Documentación y manuales'],
    continuousService: ['Soporte técnico y funcional','Mantención del sistema','Infraestructura y seguridad','Monitoreo y respaldos','Actualizaciones y mejoras'],
  },
  documentaryTensions: [{
    topic: 'Monitoreo',
    proposal: 'La propuesta comercial incluye monitoreo y respaldos dentro del servicio mensual.',
    contract: 'El contrato excluye expresamente el monitoreo de servidores locales y otros dispositivos.',
    rule: 'No presentar monitoreo local como obligación contractual sin localizar una versión final o modificación posterior que lo incorpore.',
  }],
  currentExpansionExamples: [
    { capability: 'Integración real con Laudus + inteligencia Compras/Finanzas', classification: 'adicional_a_contrato_explicito', rationale: 'El contrato explícito no nombra integración ERP financiera ni conciliación OC-recepción-factura.' },
    { capability: 'Supplier Intelligence / Proveedor 360 económico', classification: 'adicional_a_contrato_explicito', rationale: 'Concentración de proveedor, variación de precios y exposición operacional no aparecen como módulo contractual.' },
    { capability: 'Bandeja de decisiones y closed loop de abastecimiento', classification: 'adicional_a_contrato_explicito', rationale: 'El contrato no contempla workflows de decisión asistida ni medición de resultados.' },
    { capability: 'Valor MOTIL / evidencia E1-E3 / scorecard comercial', classification: 'adicional_a_contrato_explicito', rationale: 'No forma parte de los tres módulos contractuales ni de los entregables específicos de implementación.' },
    { capability: 'WhatsApp/document intelligence e ingesta operacional', classification: 'ampliacion_sobre_propuesta', rationale: 'La propuesta contempla integraciones en términos generales, pero no compromete este canal ni esta automatización específica.' },
    { capability: 'Legal/SERNAGEOMIN y revisión documental especializada', classification: 'ampliacion_sobre_propuesta', rationale: 'La propuesta menciona cumplimiento de forma amplia; el contrato explícito no define esta vertical especializada.' },
  ],
} as const;

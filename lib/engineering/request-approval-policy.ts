// Pure policy for engineering requests. This module never grants database permissions.
export const ENGINEERING_REQUEST_PRIORITIES = ['normal', 'alta', 'urgente', 'critica'] as const;
export const ENGINEERING_REQUEST_STATES = [
  'borrador', 'en_revision_supervision',
  'pendiente_gerencia', 'aprobada', 'rechazada',
] as const;
export type EngineeringPriority = typeof ENGINEERING_REQUEST_PRIORITIES[number];
export type EngineeringRequestState = typeof ENGINEERING_REQUEST_STATES[number];
export type EngineeringDecision = 'aprobar' | 'rechazar';
export type EngineeringApprovalRole = 'supervision' | 'gerencia';
export type EngineeringApprovalEvidence = {
  role: EngineeringApprovalRole;
  actorId: string;
  decision: EngineeringDecision;
  signedAt: string;
  evidenceId: string;
};
export type EngineeringRequest = {
  id: string;
  organizationId: string;
  requestingDepartmentId: string;
  priority: EngineeringPriority;
  changesApprovedProgram: boolean;
  classifiedByEngineeringId: string | null;
  classifiedAt: string | null;
  state: EngineeringRequestState;
  approvals: EngineeringApprovalEvidence[];
};

export function requiredEngineeringApprovals(request: Pick<EngineeringRequest, 'priority' | 'changesApprovedProgram'>): EngineeringApprovalRole[] {
  return request.changesApprovedProgram || request.priority === 'urgente' || request.priority === 'critica'
    ? ['supervision', 'gerencia']
    : ['supervision'];
}

export function evaluateEngineeringApproval(request: EngineeringRequest, actor: {
  id: string; organizationId: string; role: EngineeringApprovalRole; canApprove: boolean;
}, decision: EngineeringDecision): { allowed: boolean; reason: string; nextState?: EngineeringRequestState } {
  if (!actor.canApprove || actor.organizationId !== request.organizationId) {
    return { allowed: false, reason: 'Sin autorización para aprobar en esta organización' };
  }
  if (!['en_revision_supervision', 'pendiente_gerencia'].includes(request.state)) {
    return { allowed: false, reason: 'La solicitud no está en revisión' };
  }
  if (!request.classifiedByEngineeringId || !request.classifiedAt) {
    return { allowed: false, reason: 'Ingeniería debe clasificar la solicitud antes de aprobar' };
  }
  if (!actor.id) {
    return { allowed: false, reason: 'La firma requiere un actor identificado' };
  }
  const roles = requiredEngineeringApprovals(request);
  // Fail closed: do not silently discard missing, rejected or incomplete signatures.
  // A missing signature cannot be interpreted as approval of a different stage.
  const completed = request.approvals;
  if (completed.length >= roles.length || completed.some((a, i) =>
    a.decision !== 'aprobar' ||
    a.role !== roles[i] ||
    !a.actorId || !a.signedAt || !a.evidenceId ||
    completed.slice(0, i).some(previous => previous.actorId === a.actorId)
  )) {
    return { allowed: false, reason: 'La cadena de validaciones previas es inválida o incompleta' };
  }
  const nextRole = roles[completed.length];
  const expectedState: EngineeringRequestState = nextRole === 'gerencia'
    ? 'pendiente_gerencia' : 'en_revision_supervision';
  if (request.state !== expectedState || actor.role !== nextRole) {
    return { allowed: false, reason: 'No corresponde esta etapa de validación' };
  }
  if (completed.some(a => a.actorId === actor.id)) {
    return { allowed: false, reason: 'Un mismo actor no puede firmar dos etapas' };
  }
  if (decision === 'rechazar') {
    return { allowed: true, reason: 'Rechazo sujeto a registro firmado', nextState: 'rechazada' };
  }
  const nextState: EngineeringRequestState = completed.length + 1 === roles.length
    ? 'aprobada' : 'pendiente_gerencia';
  return { allowed: true, reason: 'Aprobación sujeta a registro firmado', nextState };
}

// Classification is an explicit human action; no assistant may self-assign urgency.
export function classifyEngineeringRequest(request: EngineeringRequest, classification: {
  priority: EngineeringPriority; actorId: string; actorOrganizationId: string;
  isEngineeringLead: boolean; classifiedAt: string;
}): EngineeringRequest {
  if (!classification.isEngineeringLead || classification.actorOrganizationId !== request.organizationId || !classification.actorId || !classification.classifiedAt) {
    throw new Error('Solo la jefatura de Ingeniería puede clasificar la solicitud');
  }
  // Retagging would otherwise leave a stale program-change flag. Until an
  // audited reclassification transition exists, classify only once.
  if (request.classifiedByEngineeringId || request.classifiedAt || request.approvals.length || request.state === 'aprobada' || request.state === 'rechazada') {
    throw new Error('La solicitud ya fue clasificada o firmada; requiere revisión auditada');
  }
  return { ...request, priority: classification.priority,
    changesApprovedProgram: request.changesApprovedProgram || classification.priority === 'urgente' || classification.priority === 'critica',
    classifiedByEngineeringId: classification.actorId, classifiedAt: classification.classifiedAt };
}

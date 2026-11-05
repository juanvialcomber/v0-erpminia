import type { OrganizationSuccessContext } from '@/lib/api/organization-context';
import { getMaintenanceWorkOrderCreationCapability } from '@/lib/maintenance/work-order-create-access';
import { isAdminRole } from '@/lib/api/module-access';

const OT_APPROVER_NAMES = new Set(['Ariel López', 'Mauricio Astudillo']);

export type MaintenanceActorAuthority = {
  personId: string | null;
  personName: string | null;
  cargoName: string | null;
  accessLevel: 'ED' | 'LEC' | 'SR';
  canPlan: boolean;
  canCreateWorkOrder: boolean;
  canCreateEmergencyWorkOrder: boolean;
  emergencySelfAssignOnly: boolean;
  canApprove: boolean;
  canReadAllWorkOrders: boolean;
};

export async function getMaintenanceActorAuthority(
  context: OrganizationSuccessContext,
): Promise<MaintenanceActorAuthority> {
  const creation = await getMaintenanceWorkOrderCreationCapability(context);
  const canPlan = creation.canCreate || isAdminRole(context.role);

  const canApprove = OT_APPROVER_NAMES.has(String(creation.personName || ''));
  const canReadAllWorkOrders = canPlan || canApprove || creation.accessLevel === 'LEC';

  return {
    personId: creation.personId,
    personName: creation.personName,
    cargoName: creation.cargoName,
    accessLevel: creation.accessLevel,
    canPlan,
    canCreateWorkOrder: creation.canCreate || isAdminRole(context.role),
    canCreateEmergencyWorkOrder: creation.canCreateEmergency || isAdminRole(context.role),
    emergencySelfAssignOnly: creation.emergencySelfAssignOnly && !isAdminRole(context.role),
    canApprove,
    canReadAllWorkOrders,
  };
}

export function getWorkOrderPermissions(
  authority: MaintenanceActorAuthority,
  order: {
    status?: string | null;
    assigned_person_id?: string | null;
    created_by?: string | null;
  },
) {
  const status = String(order.status || '').toLowerCase();
  const isOperational = Boolean(order.created_by);
  const isTerminal = ['completed', 'closed', 'cancelled', 'canceled'].includes(status);
  const isAssignedExecutor = Boolean(
    isOperational
    && authority.personId
    && order.assigned_person_id
    && authority.personId === order.assigned_person_id,
  );

  return {
    canPlan: isOperational && authority.canPlan && !isTerminal,
    canEditOrder: isOperational && authority.canPlan && !isTerminal,
    canAssign: isOperational && authority.canPlan && !isTerminal && status !== 'in_progress',
    canCancel: isOperational && authority.canPlan && !isTerminal,
    canStart: isOperational && isAssignedExecutor && !isTerminal && status !== 'in_progress',
    canRecordExecution: isOperational && isAssignedExecutor && !isTerminal,
    canClose: isOperational && isAssignedExecutor && status === 'in_progress',
    canApprove: isOperational && authority.canApprove && status === 'completed',
    isAssignedExecutor,
    isApprover: authority.canApprove,
  };
}

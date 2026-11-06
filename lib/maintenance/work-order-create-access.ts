import type { OrganizationSuccessContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

function normalizeCargo(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

export function isMaintenanceWorkOrderCreatorCargo(cargoName?: string | null) {
  const cargo = normalizeCargo(cargoName);

  return (
    cargo === 'jefe departamento de mantenimiento' ||
    cargo === 'jefe de planificación' ||
    cargo === 'jefe de equipos móviles y estacionarios' ||
    cargo.startsWith('jefe de taller mina ') ||
    cargo.startsWith('jefe mina ') ||
    cargo.startsWith('jefe de mina ')
  );
}

export function isEmergencyWorkOrderCreatorCargo(cargoName?: string | null) {
  const cargo = normalizeCargo(cargoName);

  return (
    isMaintenanceWorkOrderCreatorCargo(cargoName) ||
    cargo.startsWith('mecánico') ||
    cargo === 'soldador' ||
    cargo === 'encargado de camionetas y camiones'
  );
}

export async function getMaintenanceWorkOrderCreationCapability(
  context: OrganizationSuccessContext,
) {
  const [{ data: profile, error: profileError }, { data: person, error: personError }] = await Promise.all([
    context.supabase
      .from('profiles')
      .select('cargo_id')
      .eq('id', context.userId)
      .eq('organization_id', context.organizationId)
      .maybeSingle(),
    context.supabase
      .from('people')
      .select('id,full_name,role_title,employment_status')
      .eq('organization_id', context.organizationId)
      .eq('profile_id', context.userId)
      .eq('employment_status', 'active')
      .maybeSingle(),
  ]);

  if (profileError) throw profileError;
  if (personError) throw personError;

  let cargoName: string | null = null;
  if (profile?.cargo_id) {
    const { data: cargo, error: cargoError } = await context.supabase
      .from('cargos')
      .select('name')
      .eq('id', profile.cargo_id)
      .maybeSingle();
    if (cargoError) throw cargoError;
    cargoName = cargo?.name || null;
  }

  const accessLevel = await getModuleAccessLevel(
    context.userId,
    context.role,
    MODULE_KEYS.MANT_OPERACIONES,
  );

  const canCreate = Boolean(person?.id) && accessLevel === 'ED' && isMaintenanceWorkOrderCreatorCargo(cargoName);
  const canCreateEmergency = Boolean(person?.id) && isEmergencyWorkOrderCreatorCargo(cargoName);

  return {
    canCreate,
    canCreateEmergency,
    emergencySelfAssignOnly: canCreateEmergency && !canCreate,
    accessLevel,
    cargoName,
    personId: person?.id || null,
    personName: person?.full_name || null,
  };
}

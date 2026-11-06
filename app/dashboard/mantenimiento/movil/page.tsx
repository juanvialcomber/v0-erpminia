import { MobileTerrainPanel } from '@/components/maintenance/mobile-terrain-panel';
import { getMaintenanceWorkOrderCreationCapability } from '@/lib/maintenance/work-order-create-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { headers } from 'next/headers';

export const metadata = {
  title: 'Operación en terreno de mantenimiento',
  description: 'Vista rápida para terreno y técnicos de mantenimiento',
};

export default async function MaintenanceMobilePage() {
  const headerStore = await headers();
  const request = new Request('https://motil.local/dashboard/mantenimiento/movil', { headers: headerStore });
  const context = await getOrganizationContext(request as never);
  let canCreateEmergencyWorkOrder = false;
  if (context.ok) {
    const capability = await getMaintenanceWorkOrderCreationCapability(context);
    canCreateEmergencyWorkOrder = capability.canCreateEmergency;
  }
  return <MobileTerrainPanel canCreateEmergencyWorkOrder={canCreateEmergencyWorkOrder} />;
}

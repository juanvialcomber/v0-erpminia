export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type TemplateRow = {
  id: string;
  vehicle_type: string | null;
  name: string | null;
  code: string | null;
  parent_id: string | null;
  level: number | string | null;
  description: string | null;
};

type ComponentRow = {
  id: string;
  vehicle_id: string | null;
  template_id: string | null;
  code: string | null;
  name: string | null;
  parent_id: string | null;
  status: string | null;
  last_maintenance: string | null;
  maintenance_hours: number | string | null;
  created_at: string | null;
};

type VehicleRow = {
  id: string;
  code: string | null;
  name: string | null;
  vehicle_type: string | null;
  model: string | null;
  status: string | null;
  site: string | null;
};

type FaultModeRow = {
  id: string;
  component_template_id: string | null;
  fault_code: string | null;
  fault_name: string | null;
  severity: string | null;
};

type ComponentTemplateSummary = {
  id: string;
  code: string | null;
  name: string | null;
  vehicleType: string | null;
  level: number | string | null;
  description: string | null;
  totalInstances: number;
  degraded: number;
  failures: number;
  faultModes: number;
  nextInterventions: Array<{
    id: string;
    code: string | null;
    name: string | null;
    status: string | null;
    hours: number;
    lastMaintenance: string | null;
    daysSince: number | null;
    vehicle: VehicleRow | null;
  }>;
};

type ComponentInstanceSummary = ComponentTemplateSummary['nextInterventions'][number];

function toDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [templatesResult, componentsResult, vehiclesResult, faultModesResult] = await Promise.all([
      context.supabase.from('components_template').select('id, vehicle_type, name, code, parent_id, level, description'),
      context.supabase.from('components').select('id, vehicle_id, template_id, code, name, parent_id, status, last_maintenance, maintenance_hours, created_at'),
      context.supabase.from('vehicles').select('id, code, name, vehicle_type, model, status, site'),
      context.supabase.from('fault_modes').select('id, component_template_id, fault_code, fault_name, severity'),
    ]);

    if (templatesResult.error) throw templatesResult.error;
    if (componentsResult.error) throw componentsResult.error;
    if (vehiclesResult.error) throw vehiclesResult.error;
    if (faultModesResult.error) throw faultModesResult.error;

    const templates = (templatesResult.data || []) as TemplateRow[];
    const components = (componentsResult.data || []) as ComponentRow[];
    const vehicles = (vehiclesResult.data || []) as VehicleRow[];
    const faultModes = (faultModesResult.data || []) as FaultModeRow[];

    const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle] as const));

    const majorTemplates = templates.filter(
      (template) =>
        Number(template.level || 0) <= 1 ||
        ['motor', 'transmision', 'diferenciales', 'bombas', 'cilindros', 'enfriadores', 'perforadoras', 'baldes'].some((part) =>
          String(template.name || '').toLowerCase().includes(part)
        )
    );

    const componentsByTemplate: ComponentTemplateSummary[] = majorTemplates.map((template) => {
      const instances = components.filter((component) => component.template_id === template.id);
      const faultCount = faultModes.filter((fault) => fault.component_template_id === template.id).length;
      const degraded = instances.filter((instance) => String(instance.status || '').toLowerCase() === 'degradado').length;
      const failure = instances.filter((instance) => String(instance.status || '').toLowerCase() === 'fallo').length;

      const nextInterventions = instances
        .map((instance) => {
          const lastMaintenance = instance.last_maintenance ? new Date(instance.last_maintenance) : null;
          const daysSince = lastMaintenance ? Math.floor((Date.now() - lastMaintenance.getTime()) / (1000 * 60 * 60 * 24)) : null;
          const vehicle = instance.vehicle_id ? vehicleMap.get(instance.vehicle_id) || null : null;
          return {
            id: instance.id,
            code: instance.code,
            name: instance.name,
            status: instance.status,
            hours: Number(instance.maintenance_hours || 0),
            lastMaintenance: toDate(instance.last_maintenance),
            daysSince,
            vehicle,
          } satisfies ComponentInstanceSummary;
        })
        .sort((a, b) => (a.daysSince ?? 9999) - (b.daysSince ?? 9999));

      return {
        id: template.id,
        code: template.code,
        name: template.name,
        vehicleType: template.vehicle_type,
        level: template.level,
        description: template.description || null,
        totalInstances: instances.length,
        degraded,
        failures: failure,
        faultModes: faultCount,
        nextInterventions: nextInterventions.slice(0, 5),
      };
    });

    const summary = {
      totalTemplates: majorTemplates.length,
      totalComponents: componentsByTemplate.reduce((sum, item) => sum + item.totalInstances, 0),
      degraded: componentsByTemplate.reduce((sum, item) => sum + item.degraded, 0),
      failures: componentsByTemplate.reduce((sum, item) => sum + item.failures, 0),
    };

    return NextResponse.json({ summary, componentsByTemplate });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar componentes mayores';
    return NextResponse.json({ summary: { totalTemplates: 0, totalComponents: 0, degraded: 0, failures: 0 }, componentsByTemplate: [], error: message }, { status: 500 });
  }
}

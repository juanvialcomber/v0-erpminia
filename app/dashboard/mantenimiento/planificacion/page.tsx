import { WeeklyMaintenancePlanning } from '@/components/maintenance/weekly-maintenance-planning';

export const metadata = {
  title: 'Planificación semanal',
  description: 'Decisiones semanales de mantenimiento preparadas por MOTIL para revisión de Ariel.',
};

export default function MantenimientoPlanificacionPage() {
  return <WeeklyMaintenancePlanning />;
}

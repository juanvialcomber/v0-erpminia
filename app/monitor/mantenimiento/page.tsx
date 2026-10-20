import type { Metadata } from 'next';
import MaintenanceControlTowerPage from '@/components/maintenance/control-tower-screen';

export const metadata: Metadata = {
  title: 'Torre de Control Mantenimiento',
  robots: { index: false, follow: false },
};

// Authentication is enforced by the central proxy for both custom and Supabase sessions.
export default function MaintenanceMonitorPage() {
  return (
    <main className="min-h-screen bg-background p-4 lg:p-6">
      <MaintenanceControlTowerPage />
    </main>
  );
}

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import MaintenanceControlTowerPage from '@/components/maintenance/control-tower-screen';

export const metadata: Metadata = {
  title: 'Torre de Control Mantenimiento',
  robots: { index: false, follow: false },
};

export default async function MaintenanceMonitorPage() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth_token');

  if (!authToken) {
    redirect('/login?next=/monitor/mantenimiento');
  }

  return (
    <main className="min-h-screen bg-background p-4 lg:p-6">
      <MaintenanceControlTowerPage />
    </main>
  );
}

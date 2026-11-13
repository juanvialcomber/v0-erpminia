import Link from 'next/link';
import { TopografiaDashboard } from '@/components/production/topografia-dashboard';

export default function TopografiaPage() {
  return <div className="space-y-4">
    <div className="flex justify-end"><Link href="/dashboard/ingenieria/proyectos" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ingeniería y Proyectos</Link></div>
    <TopografiaDashboard />
  </div>;
}

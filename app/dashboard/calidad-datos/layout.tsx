import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export default function DataQualityLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-4">
    <nav className="flex flex-wrap gap-2" aria-label="Gobierno de datos">
      <Button asChild size="sm" variant="outline"><Link href="/dashboard/calidad-datos/salud">Salud transversal</Link></Button>
      <Button asChild size="sm" variant="outline"><Link href="/dashboard/calidad-datos">Conciliación</Link></Button>\n      <Button asChild size="sm" variant="outline"><Link href="/dashboard/calidad-datos/laudus">Laudus</Link></Button>
    </nav>
    {children}
  </div>;
}

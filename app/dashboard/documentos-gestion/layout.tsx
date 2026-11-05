'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, FileBarChart, FileCheck2, FolderKanban, PackageSearch, Scale, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard/documentos-gestion', label: 'Resumen', icon: FolderKanban },
  { href: '/dashboard/documentos-gestion/contratos', label: 'Contratos', icon: Scale },
  { href: '/dashboard/documentos-gestion/procedimientos', label: 'Procedimientos', icon: FileCheck2 },
  { href: '/dashboard/documentos-gestion/seguridad', label: 'Seguridad', icon: ShieldCheck },
  { href: '/dashboard/documentos-gestion/adquisiciones', label: 'Adquisiciones', icon: PackageSearch },
  { href: '/dashboard/documentos-gestion/eecc', label: 'Contratistas', icon: Building2 },
  { href: '/dashboard/documentos-gestion/reportes', label: 'Reportes', icon: FileBarChart },
];

export default function DocumentManagementLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const focusedIntake = pathname === '/dashboard/documentos-gestion/ingesta';

  if (focusedIntake) return <>{children}</>;

  return (
    <div className="space-y-5">
      <section className="border-b border-border pb-4">
        <nav className="flex flex-wrap gap-2" aria-label="Navegación de gestión documental">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/dashboard/documentos-gestion'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </section>
      {children}
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useModuleAccess } from '@/hooks/use-module-access';

const operationItems = [
  { href: '/dashboard/finanzas', label: 'Resumen' },
  { href: '/dashboard/finanzas/pagos', label: 'Pagos' },
];

const controlItems = [
  { href: '/dashboard/finanzas/centros', label: 'Centros de costos', moduleKey: 'core_centros_costos' },
  { href: '/dashboard/finanzas/reportes', label: 'Reportes', moduleKey: 'fin_reportes' },
  { href: '/dashboard/finanzas/proveedores', label: 'Proveedores' },
  { href: '/dashboard/finanzas/trazabilidad', label: 'Origen' },
  { href: '/dashboard/finanzas/fuentes', label: 'Datos de origen' },
  { href: '/dashboard/finanzas/documentos', label: 'Documentos' },
];

function isActive(pathname: string, href: string) {
  return href === '/dashboard/finanzas'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function FinanceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canEdit, canView, enforced, ready } = useModuleAccess();
  const visibleOperationItems = operationItems.filter((item) => item.href !== '/dashboard/finanzas/pagos' || (ready && canEdit('fin_finanzas')));
  const visibleControlItems = controlItems.filter((item) => !item.moduleKey || !enforced || canView(item.moduleKey));

  return (
    <div className="space-y-5">
      <section className="border-b border-border" aria-label="Área de Finanzas">
        <div className="flex min-h-12 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex shrink-0 items-stretch">
            <span className="flex items-center px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">Operación</span>
            <nav className="flex items-stretch" aria-label="Operación financiera">
              {visibleOperationItems.map((item) => {
                const active = isActive(pathname, item.href);
                return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('relative inline-flex min-h-12 shrink-0 items-center px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}><span className="whitespace-nowrap">{item.label}</span>{active ? <span className="absolute inset-x-2.5 bottom-0 h-0.5 bg-primary" aria-hidden="true" /> : null}</Link>;
              })}
            </nav>
          </div>
          <div className="mx-2 my-3 w-px shrink-0 bg-border" aria-hidden="true" />
          <div className="flex shrink-0 items-stretch">
            <span className="flex items-center px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">Control</span>
            <nav className="flex items-stretch" aria-label="Control financiero">
              {visibleControlItems.map((item) => {
                const active = isActive(pathname, item.href);
                return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('relative inline-flex min-h-12 shrink-0 items-center px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}><span className="whitespace-nowrap">{item.label}</span>{active ? <span className="absolute inset-x-2.5 bottom-0 h-0.5 bg-primary" aria-hidden="true" /> : null}</Link>;
              })}
            </nav>
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useModuleAccess } from '@/hooks/use-module-access';

const operationItems = [
  { href: '/dashboard/bodega', label: 'Inventario' },
  { href: '/dashboard/bodega/repuestos-criticos', label: 'Repuestos críticos' },
];

const supportItems = [
  { href: '/dashboard/bodega/productos-360', label: 'Producto 360°' },
  { href: '/dashboard/bodega/inteligencia', label: 'Inteligencia' },
  { href: '/dashboard/bodega/documentos', label: 'Documentos' },
  { href: '/dashboard/bodega/fuentes', label: 'Fuentes' },
  { href: '/dashboard/bodega/laudus', label: 'Laudus' },
  { href: '/dashboard/bodega/importar-datos', label: 'Importar' },
];

function isActive(pathname: string, href: string) {
  return href === '/dashboard/bodega'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function WarehouseLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canEdit, ready } = useModuleAccess();
  const visibleSupportItems = supportItems.filter((item) => item.href !== '/dashboard/bodega/importar-datos' || (ready && canEdit('bodega_inventario')));

  return (
    <div className="space-y-5">
      <section className="border-b border-border" aria-label="Área de Bodega">
        <div className="flex min-h-12 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex shrink-0 items-stretch">
            <span className="flex items-center px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
              Operación
            </span>
            <nav className="flex items-stretch" aria-label="Operación de Bodega">
              {operationItems.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex min-h-12 shrink-0 items-center px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="whitespace-nowrap">{item.label}</span>
                    {active ? <span className="absolute inset-x-2.5 bottom-0 h-0.5 bg-primary" aria-hidden="true" /> : null}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mx-2 my-3 w-px shrink-0 bg-border" aria-hidden="true" />

          <div className="flex shrink-0 items-stretch">
            <span className="flex items-center px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
              Herramientas
            </span>
            <nav className="flex items-stretch" aria-label="Herramientas de Bodega">
              {visibleSupportItems.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex min-h-12 shrink-0 items-center px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="whitespace-nowrap">{item.label}</span>
                    {active ? <span className="absolute inset-x-2.5 bottom-0 h-0.5 bg-primary" aria-hidden="true" /> : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

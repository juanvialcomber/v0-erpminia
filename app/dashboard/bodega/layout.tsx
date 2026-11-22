'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModuleAccess } from '@/hooks/use-module-access';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// One entry for each real workflow. Secondary tools stay available under "Más".
const operationItems = [
  { href: '/dashboard/bodega', label: 'Inventario' },
  { href: '/dashboard/bodega/verificar-stock', label: 'Conteos' },
  { href: '/dashboard/bodega/materiales-mantenimiento', label: 'Materiales de OT' },
  { href: '/dashboard/bodega/repuestos-criticos', label: 'Repuestos críticos' },
];

const secondaryItems = [
  { href: '/dashboard/bodega/acuerdos', label: 'Definiciones de Bodega' },
  { href: '/dashboard/bodega/productos-360', label: 'Producto 360°' },
  { href: '/dashboard/bodega/inteligencia', label: 'Inteligencia' },
  { href: '/dashboard/bodega/documentos', label: 'Documentos' },
  { href: '/dashboard/bodega/fuentes', label: 'Fuentes' },
  { href: '/dashboard/bodega/importar-datos', label: 'Importar datos' },
];

function isActive(pathname: string, href: string) {
  return href === '/dashboard/bodega'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function WarehouseLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canEdit, ready } = useModuleAccess();
  const visibleSecondary = secondaryItems.filter((item) =>
    item.href !== '/dashboard/bodega/importar-datos' || (ready && canEdit('bodega_inventario')));
  const secondaryActive = visibleSecondary.some((item) => isActive(pathname, item.href));

  return (
    <div className="space-y-5">
      <section className="border-b border-border" aria-label="Área de Bodega">
        <div className="flex min-h-12 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex shrink-0 items-stretch" aria-label="Operación de Bodega">
            <span className="flex items-center px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">Operación</span>
            {operationItems.map((item) => {
              const active = isActive(pathname, item.href);
              return <Link
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
              </Link>;
            })}
          </nav>
          <div className="mx-2 my-3 w-px shrink-0 bg-border" aria-hidden="true" />
          <nav className="flex shrink-0 items-stretch" aria-label="Seguimiento de Bodega">
            <Link href="/dashboard/acciones" className="inline-flex min-h-12 shrink-0 items-center px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
              Mi trabajo
            </Link>
          </nav>
          <div className="flex shrink-0 items-stretch">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Más opciones de Bodega"
                  className={cn(
                    'inline-flex min-h-12 items-center gap-1 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    secondaryActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Más <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {visibleSecondary.map((item) => <DropdownMenuItem asChild key={item.href}>
                  <Link href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
                    {item.label}
                  </Link>
                </DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}

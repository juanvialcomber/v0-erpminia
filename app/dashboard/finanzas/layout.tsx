'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModuleAccess } from '@/hooks/use-module-access';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type FinanceItem = {
  href: string;
  label: string;
  moduleKey?: string;
  requiresEdit?: boolean;
};

const primaryItems: FinanceItem[] = [
  { href: '/dashboard/finanzas', label: 'Resumen' },
  { href: '/dashboard/finanzas/pagos', label: 'Pagos', requiresEdit: true },
  { href: '/dashboard/finanzas/proveedores', label: 'Proveedores' },
  { href: '/dashboard/finanzas/trazabilidad', label: 'Trazabilidad' },
];

const secondaryItems: FinanceItem[] = [
  { href: '/dashboard/finanzas/centros', label: 'Centros de costos', moduleKey: 'core_centros_costos' },
  { href: '/dashboard/finanzas/reportes', label: 'Reportes', moduleKey: 'fin_reportes' },
  { href: '/dashboard/finanzas/fuentes', label: 'Fuentes y calidad' },
  { href: '/dashboard/finanzas/documentos', label: 'Documentos' },
  { href: '/dashboard/finanzas/calendario', label: 'Calendario' },
];

function isActive(pathname: string, href: string) {
  return href === '/dashboard/finanzas'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function FinanceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canEdit, canView, enforced, ready } = useModuleAccess();

  const canUse = (item: FinanceItem) => {
    if (item.requiresEdit && (!ready || !canEdit('fin_finanzas'))) return false;
    if (item.moduleKey && enforced && !canView(item.moduleKey)) return false;
    return true;
  };

  const visiblePrimary = primaryItems.filter(canUse);
  const visibleSecondary = secondaryItems.filter(canUse);
  const secondaryActive = visibleSecondary.some((item) => isActive(pathname, item.href));
  const activeSecondary = visibleSecondary.find((item) => isActive(pathname, item.href));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card/60" aria-label="Navegación de Finanzas">
        <div className="flex min-h-12 items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-3 [&::-webkit-scrollbar]:hidden">
          <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Finanzas">
            {visiblePrimary.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-10 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {visibleSecondary.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant={secondaryActive ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-10 shrink-0 gap-1.5"
                  aria-label="Más opciones de Finanzas"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span>{activeSecondary?.label || 'Más'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {visibleSecondary.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                      className="cursor-pointer"
                    >
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </section>

      {children}
    </div>
  );
}

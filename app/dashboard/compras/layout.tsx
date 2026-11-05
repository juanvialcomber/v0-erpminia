'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModuleAccess } from '@/hooks/use-module-access';

const flowItems = [
  { href: '/dashboard/compras/flujo', label: 'Comprar', step: 1 },
  { href: '/dashboard/compras/control-proveedores/candidatos', label: 'Cotizar', step: 2 },
  { href: '/dashboard/compras', label: 'Órdenes', step: 3 },
  { href: '/dashboard/compras/facturas', label: 'Facturas', step: 4 },
];

const supportItems = [
  { href: '/dashboard/compras/proveedores-360', label: 'Proveedores' },
  { href: '/dashboard/compras/devoluciones', label: 'Devoluciones' },
  { href: '/dashboard/compras/documentos', label: 'Documentos' },
  { href: '/dashboard/compras/fuentes', label: 'Fuentes' },
  { href: '/dashboard/compras/inteligencia', label: 'Análisis' },
  { href: '/dashboard/compras/importar-existencias', label: 'Importar' },
];

const supplierPrefixes = [
  '/dashboard/compras/control-proveedores',
  '/dashboard/compras/proveedores-360',
];

function isFlowActive(pathname: string, href: string) {
  if (href === '/dashboard/compras') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isSupportActive(pathname: string, href: string) {
  if (href === '/dashboard/compras/proveedores-360') {
    return supplierPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
      && pathname !== '/dashboard/compras/control-proveedores/candidatos';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PurchasesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canEdit } = useModuleAccess();
  const visibleSupportItems = supportItems.filter((item) => item.label !== 'Importar' || canEdit('fin_compras'));

  return (
    <div className="space-y-5">
      <section className="border-b border-border" aria-label="Flujo de Compras">
        <div className="flex min-h-12 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex shrink-0 items-stretch" aria-label="Flujo operacional de Compras">
            {flowItems.map((item, index) => {
              const active = isFlowActive(pathname, item.href);
              return (
                <div key={item.href} className="flex shrink-0 items-center">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex min-h-12 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className={cn('text-[9px] font-semibold tracking-[0.12em]', active ? 'text-primary' : 'text-muted-foreground/60')}>
                      {String(item.step).padStart(2, '0')}
                    </span>
                    <span className="whitespace-nowrap">{item.label}</span>
                    {active ? <span className="absolute inset-x-2.5 bottom-0 h-0.5 bg-primary" aria-hidden="true" /> : null}
                  </Link>
                  {index < flowItems.length - 1 ? <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/35" aria-hidden="true" /> : null}
                </div>
              );
            })}
          </nav>

          <div className="mx-2 my-3 w-px shrink-0 bg-border" aria-hidden="true" />

          <div className="flex shrink-0 items-stretch">
            <span className="flex items-center px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
              Soporte
            </span>
            <nav className="flex items-stretch" aria-label="Soporte de Compras">
              {visibleSupportItems.map((item) => {
                const active = isSupportActive(pathname, item.href);
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

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, CalendarDays, CircleDollarSign, Home, MessageSquare, ShoppingCart, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModuleAccess } from '@/hooks/use-module-access';
import type { Dictionary } from '@/lib/i18n/dictionaries';

type MobileItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav({ dictionary }: { dictionary: Dictionary }) {
  const pathname = usePathname();
  const { canView, ready, isAdmin } = useModuleAccess();
  const t = dictionary.app.nav.items;

  const areaCandidates: MobileItem[] = ready
    ? [
        ...(isAdmin || canView('mant_operaciones') ? [{ href: '/dashboard/mantenimiento', label: t.maintenance, icon: Wrench }] : []),
        ...(isAdmin || canView('prod_operaciones') ? [{ href: '/dashboard/produccion', label: t.production, icon: Zap }] : []),
        ...(isAdmin || canView('bodega_inventario') ? [{ href: '/dashboard/bodega', label: t.warehouse, icon: Boxes }] : []),
        ...(isAdmin || canView('fin_compras') ? [{ href: '/dashboard/compras', label: t.procurement, icon: ShoppingCart }] : []),
        ...(isAdmin || canView('fin_finanzas') ? [{ href: '/dashboard/finanzas', label: t.finance, icon: CircleDollarSign }] : []),
      ]
    : [];
  const area = areaCandidates.find((item) => isActive(pathname, item.href)) || areaCandidates[0] || null;

  const items: MobileItem[] = [
    { href: '/dashboard', label: t.home, icon: Home },
    ...(area ? [area] : []),
    { href: '/dashboard/tareas', label: t.calendar, icon: CalendarDays },
    { href: '/dashboard/mensajes', label: t.messages, icon: MessageSquare },
  ];

  return (
    <nav
      aria-label={dictionary.app.nav.mainLabel}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/96 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/90 md:hidden"
    >
      <div className="mx-auto grid min-h-16 max-w-lg grid-flow-col auto-cols-fr items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[10px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                active ? 'text-primary' : 'text-muted-foreground active:bg-muted',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
              {active ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" aria-hidden="true" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

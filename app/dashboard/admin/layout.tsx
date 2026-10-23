'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ShieldCheck, Users, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard/admin/users', label: 'Usuarios', icon: Users },
  { href: '/dashboard/admin/roles', label: 'Roles y cargos', icon: ShieldCheck },
  { href: '/dashboard/admin/whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { href: '/dashboard/admin/valor-motil', label: 'Valor MOTIL', icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <section className="border-b border-border pb-4">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Administración y accesos</p>
          <p className="mt-1 text-sm text-muted-foreground">Usuarios, roles, cargos y alcance de acceso al sistema.</p>
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Navegación de administración">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

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

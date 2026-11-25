'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRight, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';

const areas = [
  { title: 'Usuarios', description: 'Cuentas, altas e importación.', href: '/dashboard/admin/users', icon: Users },
  { title: 'Roles y cargos', description: 'Asignar responsabilidades y revisar permisos.', href: '/dashboard/admin/roles', icon: ShieldCheck },
  { title: 'Solicitudes de acceso', description: 'Revisar cambios y aprobaciones pendientes.', href: '/dashboard/admin/roles/aprobaciones', icon: ShieldCheck },
];

export default function AdministrationPage() {
  const { user, loading, role } = useAuth();

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>;

  if (!user || (role !== 'admin' && role !== 'superadmin')) {
    return <div className="flex min-h-[60vh] items-center justify-center p-4"><Card className="max-w-md border-destructive/30 shadow-none"><CardContent className="flex gap-3 pt-6"><AlertCircle className="h-5 w-5 shrink-0 text-destructive"/><div><h2 className="font-semibold">Acceso denegado</h2><p className="mt-1 text-sm text-muted-foreground">Solo administradores pueden acceder a esta sección.</p></div></CardContent></Card></div>;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Administración</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Usuarios y accesos</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Administra quién entra, qué cargo tiene y qué puede hacer.</p></div>
      </section>

      <section className="overflow-hidden rounded-lg border">
        {areas.map((area) => { const Icon = area.icon; return <Link key={area.href} href={area.href} className="group flex items-center gap-4 border-b px-4 py-5 last:border-b-0 hover:bg-muted/35"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted"><Icon className="h-4 w-4"/></div><div className="min-w-0 flex-1"><p className="font-medium">{area.title}</p><p className="mt-0.5 text-sm text-muted-foreground">{area.description}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"/></Link>; })}
      </section>

      <p className="text-sm text-muted-foreground">Los cambios de permisos necesitan aprobación de la jefatura de área y de gerencia.</p>
    </div>
  );
}

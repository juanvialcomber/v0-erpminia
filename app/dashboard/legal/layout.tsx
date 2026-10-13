'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const primary = [
  { href: '/dashboard/legal', label: 'Inicio' },
  { href: '/dashboard/legal/asistente', label: 'Asistente IA' },
  { href: '/dashboard/legal/inbox', label: 'Pendientes' },
  { href: '/dashboard/legal/contratistas-documentos', label: 'Contratistas · Documentos' },
  { href: '/dashboard/legal/aplicabilidad-eecc', label: 'Requisitos EECC' },
  { href: '/dashboard/legal/documentos', label: 'Archivo Legal' },
];
const secondary = [
  { href: '/dashboard/legal/casos', label: 'Casos' },
  { href: '/dashboard/legal/control-contractual', label: 'Control contractual' },
  { href: '/dashboard/legal/avances-contractistas', label: 'Avances' },
  { href: '/dashboard/legal/sernageomin', label: 'Obligaciones' },
  { href: '/dashboard/legal/plazos-fatales', label: 'Plazos fatales' },
  { href: '/dashboard/legal/propiedad-minera', label: 'Propiedad minera' },
  { href: '/dashboard/legal/permisos-licencias', label: 'Permisos y licencias' },
  { href: '/dashboard/legal/importar', label: 'Importar' },
];
const isActive = (pathname: string, href: string) => href === '/dashboard/legal'
 ? pathname === href : pathname === href || pathname.startsWith(href + '/');
export default function LegalLayout({ children }: {children:ReactNode}) {
 const pathname=usePathname();
 const otherActive=secondary.some(item=>isActive(pathname,item.href));
 const link=(item:{href:string;label:string})=>{
   const active=isActive(pathname,item.href);
   return <Link key={item.href} href={item.href} aria-current={active?'page':undefined}
     className={cn('inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
       active?'bg-muted text-foreground':'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>{item.label}</Link>;
 };
 return <div className="space-y-5">
  <div className="rounded-lg border border-border/70 bg-background p-2">
   <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
     <Link href="/dashboard/legal" className="text-xs font-semibold uppercase tracking-[0.12em]">Legal / Espacio de trabajo</Link>
     <span className="text-xs text-muted-foreground">Documentación · Contratos · Cumplimiento</span>
   </div>
   <nav className="flex flex-wrap gap-1" aria-label="Navegación principal de Legal">
    {primary.map(link)}
    <details className="group relative">
      <summary className={cn('flex min-h-11 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',otherActive?'bg-muted':'text-muted-foreground hover:bg-muted/60')}>Más áreas <span aria-hidden="true" className="ml-2">⌄</span></summary>
      <div className="absolute right-0 z-30 mt-1 grid min-w-52 gap-1 rounded-md border bg-background p-2 shadow-lg">{secondary.map(link)}</div>
    </details>
   </nav>
  </div>
  {children}
 </div>;
}

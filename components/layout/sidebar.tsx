'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, CalendarDays, Boxes, ChevronDown, CircleDollarSign, FileCheck, Gem, HelpCircle, Home, Leaf, LogOut, Menu, MessageSquare, ShieldCheck, ShoppingCart, Users, Wrench, X, Zap, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useModuleAccess } from '@/hooks/use-module-access';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';
import { InstallMotilButton } from '@/components/pwa/install-motil-button';

type GroupKey = keyof Dictionary['app']['nav']['groups'];
type ItemKey = keyof Dictionary['app']['nav']['items'];
type MenuItem = { itemKey: ItemKey; href: string; icon: LucideIcon; group: GroupKey; moduleKey?: string; roles?: string[] };

const operationalRoles = ['superadmin','admin','manager','supervisor','Operaciones-Supervisor','Sostenibilidad-Supervisor','HSE-Supervisor','Bodega-Supervisor','Compras-Supervisor','jefe_mantencion','jefe_planta','jefe_produccion'];
const allStandardRoles = ['superadmin','admin','manager','supervisor','viewer','jefe_mantencion','jefe_planta','jefe_produccion','Operaciones-Supervisor','Finanzas-Supervisor','Bodega-Supervisor','Compras-Supervisor','Sostenibilidad-Supervisor','HSE-Supervisor'];
const menuItems: MenuItem[] = [
  { itemKey: 'home', href: '/dashboard', icon: Home, group: 'main', roles: allStandardRoles },
  { itemKey: 'daily', href: '/dashboard/daily-management', icon: Activity, group: 'main', roles: operationalRoles },
  { itemKey: 'calendar', href: '/dashboard/tareas', icon: CalendarDays, group: 'main', roles: allStandardRoles },
  { itemKey: 'messages', href: '/dashboard/mensajes', icon: MessageSquare, group: 'main' },
  { itemKey: 'production', href: '/dashboard/produccion', icon: Zap, group: 'areas', moduleKey: 'prod_operaciones', roles: ['superadmin','admin','Operaciones-Supervisor','jefe_mantencion','jefe_planta','jefe_produccion'] },
  { itemKey: 'geology', href: '/dashboard/produccion/geologia', icon: Gem, group: 'areas', moduleKey: 'prod_geologia' },
  { itemKey: 'maintenance', href: '/dashboard/mantenimiento', icon: Wrench, group: 'areas', moduleKey: 'mant_operaciones', roles: ['superadmin','admin','Operaciones-Supervisor','jefe_mantencion'] },
  { itemKey: 'warehouse', href: '/dashboard/bodega', icon: Boxes, group: 'areas', moduleKey: 'bodega_inventario', roles: ['superadmin','admin','Bodega-Supervisor','jefe_mantencion'] },
  { itemKey: 'procurement', href: '/dashboard/compras', icon: ShoppingCart, group: 'areas', moduleKey: 'fin_compras', roles: ['superadmin','admin','Compras-Supervisor'] },
  { itemKey: 'finance', href: '/dashboard/finanzas', icon: CircleDollarSign, group: 'areas', moduleKey: 'fin_finanzas', roles: ['superadmin','admin','Finanzas-Supervisor'] },
  { itemKey: 'hr', href: '/dashboard/rrhh', icon: Users, group: 'areas', roles: ['superadmin','admin','manager'] },
  { itemKey: 'sustainability', href: '/dashboard/sostenibilidad', icon: Leaf, group: 'areas', moduleKey: 'sos_tablero', roles: ['superadmin','admin','Sostenibilidad-Supervisor','HSE-Supervisor'] },
  { itemKey: 'legal', href: '/dashboard/legal', icon: FileCheck, group: 'areas', moduleKey: 'legal_modulo', roles: ['superadmin','admin','manager'] },
  { itemKey: 'roles', href: '/dashboard/admin/roles', icon: ShieldCheck, group: 'admin', roles: ['superadmin','admin'] },
  { itemKey: 'users', href: '/dashboard/admin/users', icon: Users, group: 'admin', roles: ['superadmin','admin'] },
  { itemKey: 'help', href: '/dashboard/guias', icon: HelpCircle, group: 'help', roles: allStandardRoles },
];
const groupOrder: GroupKey[] = ['main','areas','admin','help'];
function isItemActive(pathname:string,href:string){if(href==='/dashboard')return pathname===href;return pathname===href||pathname.startsWith(`${href}/`)}
export function Sidebar({ dictionary, locale }:{ dictionary:Dictionary; locale:Locale }){
  const t = dictionary.app.nav;
  const pathname=usePathname(); const router=useRouter(); const {role,logout}=useAuth(); const {enforced,canView,ready}=useModuleAccess();
  const [isOpen,setIsOpen]=useState(false); const [expandedGroups,setExpandedGroups]=useState<Partial<Record<GroupKey,boolean>>>({main:true,areas:true});
  const filteredItems=useMemo(()=>{if(!role||!ready)return[];return menuItems.filter((item)=>{const roleAllowed=role==='superadmin'||role==='admin'||!item.roles||item.roles.includes(role);if(enforced&&item.moduleKey){if(item.itemKey==='production'&&!canView('prod_operaciones')&&canView('prod_topografia'))return true;return canView(item.moduleKey)}if(!roleAllowed)return false;if(enforced&&item.itemKey==='production'&&!canView('prod_operaciones')&&canView('prod_topografia'))return true;if(!item.moduleKey)return true;return canView(item.moduleKey)}).map((item)=>item.itemKey==='production'&&enforced&&!canView('prod_operaciones')&&canView('prod_topografia')?{...item,href:'/dashboard/produccion/topografia'}:item)},[role,enforced,canView,ready]);
  const activeGroup=useMemo(()=>filteredItems.find((item)=>isItemActive(pathname,item.href))?.group,[filteredItems,pathname]);
  useEffect(()=>{if(activeGroup)setExpandedGroups((current)=>({...current,[activeGroup]:true}))},[activeGroup]);
  const navigate=(href:string)=>{router.push(href);setIsOpen(false)};
  return <><Button variant="outline" size="icon" aria-label={isOpen?t.close:t.open} className="fixed left-4 top-3 z-50 bg-background lg:hidden" onClick={()=>setIsOpen((current)=>!current)}>{isOpen?<X className="h-5 w-5"/>:<Menu className="h-5 w-5"/>}</Button><aside className={cn('fixed inset-y-0 left-0 z-40 flex h-screen w-[248px] flex-col border-r border-sidebar-border/80 bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0',isOpen?'translate-x-0':'-translate-x-full')}><div className="border-b border-sidebar-border/80 px-4 py-4"><Link href="/dashboard" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Image src="/brand/motil-wordmark.png" alt="MOTIL" width={2094} height={610} priority className="h-7 w-auto"/><p className="mt-2 truncate text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{t.tagline}</p></Link></div><nav className="flex-1 overflow-y-auto px-3 py-3" aria-label={t.mainLabel}><div className="space-y-2">{groupOrder.map((group)=>{const items=filteredItems.filter((item)=>item.group===group);if(!items.length)return null;const expanded=expandedGroups[group]??false;return <section key={group}><button type="button" onClick={()=>setExpandedGroups((current)=>({...current,[group]:!expanded}))} aria-expanded={expanded} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"><span>{t.groups[group]}</span><ChevronDown className={cn('h-3.5 w-3.5 transition-transform',!expanded&&'-rotate-90')}/></button>{expanded?<div className="mt-0.5 space-y-0.5">{items.map((item)=>{const Icon=item.icon;const active=isItemActive(pathname,item.href);return <button type="button" key={item.href} onClick={()=>navigate(item.href)} aria-current={active?'page':undefined} className={cn('relative flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',active?'bg-primary/10 font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary':'text-sidebar-foreground/72 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground')}><Icon className={cn('h-4 w-4 shrink-0',active?'text-primary':'text-muted-foreground')}/><span className="truncate">{item.itemKey==='production'&&item.href==='/dashboard/produccion/topografia'?(locale==='en'?'Topography':'Topografía'):<>{t.items[item.itemKey]}</>}</span></button>})}</div>:null}</section>})}</div></nav><div className="border-t border-sidebar-border/80 p-3"><InstallMotilButton locale={locale}/><ThemeToggle/><Button variant="ghost" className="mt-1 w-full justify-start gap-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={logout}><LogOut className="h-4 w-4"/>{dictionary.app.header.signOut}</Button></div></aside>{isOpen?<button type="button" aria-label={t.close} className="fixed inset-0 z-30 bg-black/45 lg:hidden" onClick={()=>setIsOpen(false)}/>:null}</>;
}

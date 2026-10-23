'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { DailyManagementContextNav } from '@/components/layout/daily-management-context-nav';
import { DocumentationContextNav } from '@/components/layout/documentation-context-nav';
import { OperationalAttentionContextNav } from '@/components/layout/operational-attention-context-nav';
import { SeniorAssistantWidget } from '@/components/intelligence/senior-assistant-widget';
import { HomeDecisionPriorities } from '@/components/dashboard/home-decision-priorities';
import { cn } from '@/lib/utils';
import { DashboardPeriodProvider } from '@/components/dashboard/dashboard-period-provider';
import { useAuth } from '@/hooks/use-auth';
import { resolveMaintenanceViewerMode } from '@/lib/maintenance/viewer-mode';
import { DataSourceAttentionBanner } from '@/components/data/data-source-attention-banner';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { Locale } from '@/lib/i18n/dictionaries';

const STORAGE_KEY = 'motil-sidebar-collapsed';

export function DashboardShell({ children, locale, dictionary }: { children: React.ReactNode; locale: Locale; dictionary: Dictionary }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === 'true');
    setReady(true);
  }, []);

  useEffect(() => {
    if (pathname !== '/dashboard') return;
    if (resolveMaintenanceViewerMode(user?.cargo || null) !== 'execution') return;
    router.replace('/dashboard/mantenimiento');
  }, [pathname, router, user?.cargo]);

  const toggleSidebar = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const financeHome = pathname === '/dashboard' && /finanzas|financiero/i.test(String(user?.cargo || ''));

  return (
    <div className="flex min-h-screen bg-background">
      <div
        className={cn(
          'w-0 shrink-0 overflow-hidden border-r border-border/60 bg-sidebar transition-[width] duration-200 ease-out lg:block',
          ready && !collapsed ? 'lg:w-[248px]' : 'lg:w-0',
        )}
        aria-hidden={ready && collapsed ? true : undefined}
      >
        <Sidebar dictionary={dictionary} locale={locale} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header sidebarCollapsed={collapsed} onToggleSidebar={toggleSidebar} locale={locale} dictionary={dictionary} />
        <DailyManagementContextNav dictionary={dictionary} />
        <DocumentationContextNav dictionary={dictionary} />
        <OperationalAttentionContextNav dictionary={dictionary} />
        <DashboardPeriodProvider>
          <main className="flex-1 overflow-x-hidden bg-muted/20 px-4 py-5 md:px-6 md:py-6 xl:px-8 xl:py-7">
            <div className="motil-page space-y-6">
              <DataSourceAttentionBanner />
              {children}
              {pathname === '/dashboard' && !financeHome ? <HomeDecisionPriorities locale={locale} dictionary={dictionary} /> : null}
            </div>
          </main>
        </DashboardPeriodProvider>
      </div>

      <SeniorAssistantWidget />
    </div>
  );
}

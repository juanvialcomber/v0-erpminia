import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { verifyCustomSession } from '@/lib/auth/signed-session';
import { resolveMaintenanceViewerMode } from '@/lib/maintenance/viewer-mode';
import { LOCALE_COOKIE, LOCALE_HEADER } from '@/lib/i18n/dictionaries';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vercel.live wss://ws-us3.pusher.com https://*.blob.vercel-storage.com https://*.private.blob.vercel-storage.com https://*.public.blob.vercel-storage.com https://blob.vercel-storage.com",
].join('; ');

const PUBLIC_API_ROUTES = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/integrations/greenapi/webhook',
  // The cron handler validates CRON_SECRET before doing any work.
  '/api/cron/whatsapp-daily',
  '/api/cron/whatsapp-history',
  '/api/cron/whatsapp-media',
  '/api/cron/whatsapp-vision',
]);

const DASHBOARD_ROUTE_MODULES: Array<{ prefix: string; modules: string[] }> = [
  { prefix: '/dashboard/mantenimiento', modules: ['mant_operaciones', 'mant_gerencial', 'mant_recursos', 'mant_documentos'] },
  { prefix: '/dashboard/produccion', modules: ['prod_operaciones', 'prod_geologia', 'prod_topografia', 'prod_quimica', 'prod_sondaje_exploracion', 'prod_sondaje_produccion', 'prod_telemetria'] },
  { prefix: '/dashboard/bodega', modules: ['bodega_inventario', 'bodega_documentos'] },
  { prefix: '/dashboard/compras', modules: ['fin_compras'] },
  { prefix: '/dashboard/finanzas', modules: ['fin_finanzas'] },
];

const DASHBOARD_EDIT_ROUTE_MODULES: Array<{ prefix: string; module: string }> = [
  { prefix: '/dashboard/produccion/ingreso-datos', module: 'prod_operaciones' },
  { prefix: '/dashboard/bodega/importar-datos', module: 'bodega_inventario' },
  { prefix: '/dashboard/bodega/documentos/importar', module: 'bodega_documentos' },
  { prefix: '/dashboard/compras/importar-existencias', module: 'fin_compras' },
  { prefix: '/dashboard/finanzas/pagos', module: 'fin_finanzas' },
];

const ADMIN_ROLES = new Set(['admin', 'superadmin', 'super_admin']);

function requiredModulesForDashboardPath(pathname: string) {
  return DASHBOARD_ROUTE_MODULES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.modules ?? null;
}

function requiredEditModuleForDashboardPath(pathname: string) {
  return DASHBOARD_EDIT_ROUTE_MODULES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.module ?? null;
}

function safePostLoginPath(request: NextRequest) {
  const redirect = request.nextUrl.searchParams.get('redirect');
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/auth/login')) {
    return '/dashboard';
  }
  return redirect;
}

async function canAccessDashboardRoute(profileId: string, role: string | null | undefined, pathname: string) {
  const requiredEditModule = requiredEditModuleForDashboardPath(pathname);
  const requiredModules = requiredModulesForDashboardPath(pathname);
  if ((!requiredModules && !requiredEditModule) || ADMIN_ROLES.has(role || '')) return true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return false;

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await admin.from('profiles').select('cargo_id').eq('id', profileId).maybeSingle();
  if (!profile?.cargo_id) return false;

  const modulesToCheck = requiredEditModule ? [requiredEditModule] : requiredModules ?? [];
  const { data: accessRows } = await admin
    .from('role_matrix')
    .select('module_key, access_level')
    .eq('cargo_id', profile.cargo_id)
    .in('module_key', modulesToCheck);

  return requiredEditModule
    ? (accessRows ?? []).some((row) => row.module_key === requiredEditModule && row.access_level === 'ED')
    : (accessRows ?? []).some((row) => row.access_level === 'ED' || row.access_level === 'LEC');
}

async function isActiveCustomSessionProfile(profileId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return false;

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await admin
    .from('profiles')
    .select('status')
    .eq('id', profileId)
    .maybeSingle();

  return profile?.status === 'active';
}

// Financial manager: explicit least-privilege boundary, including direct URL/API requests.
const FINANCE_MANAGER_CARGO_ID = '8fbc8010-7824-4c7e-b0f5-587a2c23032c';
async function isFinanceManager(profileId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing permission lookup configuration');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from('profiles').select('cargo_id,status').eq('id', profileId).single();
  if (error && error.code !== 'PGRST116') throw error;
  if (data) return data.status === 'active' && data.cargo_id === FINANCE_MANAGER_CARGO_ID;
  const { data: link, error: linkError } = await admin.from('auth_profile_identity_links').select('profile_id').eq('auth_user_id',profileId).maybeSingle();
  if (linkError) throw linkError;
  if (!link) return false;
  const { data: linked, error: linkedError } = await admin.from('profiles').select('cargo_id,status').eq('id',link.profile_id).single();
  if (linkedError) throw linkedError;
  return linked.status === 'active' && linked.cargo_id === FINANCE_MANAGER_CARGO_ID;
}
function financeManagerAllowed(path: string, method: string): boolean {
  const readOnly = ['GET','HEAD','OPTIONS'].includes(method);
  if (path === '/dashboard' || path.startsWith('/dashboard/finanzas')) return true;
  if (path === '/dashboard/compras') return true;
  if (path.startsWith('/dashboard/compras/')) return true;
  if (path.startsWith('/api/auth/') || path.startsWith('/api/me/')) return true;

  const financeIntegrationRoutes = new Set([
    '/api/integrations/laudus/invoice-po-control',
    '/api/integrations/laudus/native-invoice-trace',
    '/api/integrations/laudus/bank-reconciliation',
    '/api/integrations/laudus/finance-review-feedback',
    '/api/integrations/laudus/fixed-asset-readiness',
  ]);
  if (financeIntegrationRoutes.has(path)) {
    return path === '/api/integrations/laudus/finance-review-feedback' ? true : readOnly;
  }

  const financeApiAreas = ['assistant','certified','cost-centers','event-ledger','executive','intelligence','payables','sources','suppliers'];
  if (financeApiAreas.some(area => path === `/api/finance/${area}` || path.startsWith(`/api/finance/${area}/`))) return true;
  if (path.startsWith('/api/finance/')) return false;
  if (path.startsWith('/api/compras/')) return readOnly;
  if (path === '/api/cost-centers' || path.startsWith('/api/cost-centers/')) return true;
  return false;
}

function isPublicApiRoute(pathname: string) {
  return (
    PUBLIC_API_ROUTES.has(pathname) ||
    pathname === '/api/portal/subcontratistas' ||
    pathname.startsWith('/api/portal/subcontratistas/')
  );
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  return response;
}

function clearCustomSession(response: NextResponse) {
  for (const name of ['auth_token', 'user_role', 'user_email', 'user_cargo']) {
    response.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: name === 'auth_token',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production',
    });
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // i18n routing: /es/* es el default y redirige a la ruta sin prefijo;
  // /en/* se reescribe a la misma ruta con locale en header + cookie.
  if (pathname === '/es' || pathname.startsWith('/es/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/es/, '') || '/';
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = pathname.replace(/^\/en/, '') || '/';
    const inner = new NextRequest(targetUrl, request);
    const response = await proxyRequest(inner);

    // Redirecciones/errores internos se devuelven tal cual (apuntan a rutas sin prefijo).
    if (response.status >= 300 || response.headers.get('location')) {
      return response;
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, 'en');
    const rewritten = NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } });
    for (const cookie of response.cookies.getAll()) rewritten.cookies.set(cookie);
    rewritten.cookies.set(LOCALE_COOKIE, 'en', { path: '/', sameSite: 'lax' });
    for (const [key, value] of response.headers) {
      if (!key.startsWith('x-middleware')) rewritten.headers.set(key, value);
    }
    return withSecurityHeaders(rewritten);
  }

  const response = await proxyRequest(request);
  if (request.nextUrl.pathname !== '/auth/callback' && response.cookies.get(LOCALE_COOKIE)?.value !== 'es') {
    response.cookies.set(LOCALE_COOKIE, 'es', { path: '/', sameSite: 'lax' });
  }
  return response;
}

async function proxyRequest(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  if (request.nextUrl.pathname === '/auth/callback') {
    const code = request.nextUrl.searchParams.get('code');
    const error = request.nextUrl.searchParams.get('error');
    const errorDescription = request.nextUrl.searchParams.get('error_description');

    if (error) {
      return withSecurityHeaders(
        NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(errorDescription || error)}`, request.url))
      );
    }

    if (code) {
      try {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          return withSecurityHeaders(
            NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(exchangeError.message)}`, request.url))
          );
        }
        return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)));
      } catch {
        return withSecurityHeaders(
          NextResponse.redirect(new URL('/auth/login?error=authentication_failed', request.url))
        );
      }
    }
  }

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/api/debug') || pathname.startsWith('/api/test')) {
    return withSecurityHeaders(NextResponse.json({ error: 'Debug endpoints disabled in production' }, { status: 404 }));
  }

  if (pathname.startsWith('/api/') && isPublicApiRoute(pathname)) {
    return withSecurityHeaders(response);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authToken = request.cookies.get('auth_token')?.value;
  let customSession = await verifyCustomSession(authToken);

  if (customSession && !(await isActiveCustomSessionProfile(customSession.user.id))) {
    customSession = null;
    response = clearCustomSession(response);
  }

  const isAuthenticated = Boolean(user || customSession);
  // Apply the cargo-specific guard before the general API authorization shortcut.
  // This also rejects non-finance dashboard URLs rather than relying on hidden navigation.
  const accessIdentityId = customSession?.user.id || user?.id;
  if (accessIdentityId && (pathname.startsWith('/api/') || pathname.startsWith('/dashboard') || pathname.startsWith('/admin'))) {
    try {
      if (await isFinanceManager(accessIdentityId) && !financeManagerAllowed(pathname, request.method)) {
        if (pathname.startsWith('/api/')) {
          return withSecurityHeaders(NextResponse.json({ error: 'Acceso restringido al área de Finanzas' }, { status: 403 }));
        }
        return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard/finanzas?error=module_access_denied', request.url)));
      }
    } catch {
      return withSecurityHeaders(NextResponse.json({ error: 'No fue posible verificar permisos del cargo' }, { status: 503 }));
    }
  }


  if (authToken && !customSession) {
    response = clearCustomSession(response);
  }

  if (pathname === '/auth/login' && isAuthenticated) {
    return withSecurityHeaders(NextResponse.redirect(new URL(safePostLoginPath(request), request.url)));
  }

  if (pathname.startsWith('/api/')) {
    const isDemoMode = process.env.DEMO_PUBLIC_READ === 'true';
    const isReadRequest = request.method === 'GET';

    if (pathname.startsWith('/api/admin/canonical-import') || pathname.startsWith('/api/admin/hse-canonical-import') || pathname.startsWith('/api/admin/hse-workbooks-import')) {
      const adminToken = process.env.ADMIN_INIT_TOKEN;
      const authHeader = request.headers.get('authorization') || '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const providedToken = request.headers.get('x-admin-token') || bearer;
      if (adminToken && providedToken === adminToken) {
        return withSecurityHeaders(response);
      }
    }

    if (isDemoMode && isReadRequest) {
      return withSecurityHeaders(response);
    }

    if (!isAuthenticated) {
      return withSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    return withSecurityHeaders(response);
  }

  const protectedPaths = ['/dashboard', '/admin', '/setup', '/monitor/mantenimiento'];
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));

  if (isProtectedPath && !isAuthenticated) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);
    return withSecurityHeaders(clearCustomSession(NextResponse.redirect(loginUrl)));
  }

  if (pathname.startsWith('/dashboard') && customSession) {
    const cargoName = request.cookies.get('user_cargo')?.value || null;
    if (
      pathname === '/dashboard/mantenimiento/ordenes-trabajo' &&
      resolveMaintenanceViewerMode(cargoName) === 'execution'
    ) {
      return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard/mantenimiento', request.url)));
    }

    try {
      const allowed = await canAccessDashboardRoute(customSession.user.id, customSession.role, pathname);
      if (!allowed) {
        return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard?error=module_access_denied', request.url)));
      }
    } catch (error) {
      console.error('[access] Dashboard route guard failed:', error instanceof Error ? error.message : String(error));
      return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard?error=module_access_unavailable', request.url)));
    }
  }

  return withSecurityHeaders(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

import { useEffect, useState } from 'react';

type AuthUser = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  cargo?: string | null;
};

type AccessIdentityResponse = {
  role?: string | null;
  user?: {
    id?: string | null;
    email?: string | null;
    fullName?: string | null;
  };
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const readClientCookies = () => {
      try {
        const cookies = document.cookie.split(';');
        const roleCookie = cookies.find((cookie) => cookie.trim().startsWith('user_role='));
        const emailCookie = cookies.find((cookie) => cookie.trim().startsWith('user_email='));
        const cargoCookie = cookies.find((cookie) => cookie.trim().startsWith('user_cargo='));

        return {
          role: roleCookie ? decodeURIComponent(roleCookie.split('=')[1]) : null,
          email: emailCookie ? decodeURIComponent(emailCookie.split('=')[1]) : null,
          cargo: cargoCookie ? decodeURIComponent(cargoCookie.split('=')[1]) : null,
        };
      } catch (error) {
        console.error('[auth] Error reading client cookies:', error);
        return { role: null, email: null, cargo: null };
      }
    };

    const resolveAuth = async () => {
      const cookieIdentity = readClientCookies();

      if (cookieIdentity.email || cookieIdentity.role || cookieIdentity.cargo) {
        setUser({
          email: cookieIdentity.email,
          cargo: cookieIdentity.cargo,
        });
        setRole(cookieIdentity.role);
      }

      try {
        const response = await fetch('/api/me/access', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          if (!cookieIdentity.email && !cookieIdentity.role) {
            setUser(null);
            setRole(null);
          }
          return;
        }

        const payload = (await response.json()) as AccessIdentityResponse;
        const canonicalRole = payload.role || cookieIdentity.role || null;
        const canonicalEmail = payload.user?.email || cookieIdentity.email || null;
        const canonicalName = payload.user?.fullName || null;
        const canonicalId = payload.user?.id || null;

        setRole(canonicalRole);
        setUser({
          id: canonicalId,
          email: canonicalEmail,
          name: canonicalName,
          cargo: cookieIdentity.cargo,
        });

        if (canonicalRole && canonicalRole !== cookieIdentity.role) {
          document.cookie = `user_role=${encodeURIComponent(canonicalRole)}; path=/; max-age=604800; samesite=lax`;
        }
        if (canonicalEmail && canonicalEmail !== cookieIdentity.email) {
          document.cookie = `user_email=${encodeURIComponent(canonicalEmail)}; path=/; max-age=604800; samesite=lax`;
        }
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.error('[auth] Error resolving canonical session:', error);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void resolveAuth();
    return () => controller.abort();
  }, []);

  const logout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) console.error('[auth] Logout API failed:', response.status);

      document.cookie = 'user_email=; path=/; max-age=0';
      document.cookie = 'user_role=; path=/; max-age=0';
      document.cookie = 'user_cargo=; path=/; max-age=0';

      setUser(null);
      setRole(null);
      window.location.href = '/auth/login';
    } catch (error) {
      console.error('[auth] Error during logout:', error);
      window.location.href = '/auth/login';
    }
  };

  return { user, loading, role, logout };
}

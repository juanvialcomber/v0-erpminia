'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function FirstAccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!token) return setError('El enlace de acceso no es válido.');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return setError('Usa al menos 12 caracteres e incluye letras y números.');
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/first-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || 'No se pudo completar el primer acceso.');
        return;
      }
      router.replace('/auth/login?first_access=ready');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">Nueva contraseña</label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="confirm-password" className="text-sm font-medium">Repetir contraseña</label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          required
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Mínimo 12 caracteres, con letras y números. Este enlace funciona una sola vez.
      </p>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Configurando…' : 'Activar acceso'}
      </Button>
    </form>
  );
}

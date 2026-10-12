'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Status = { publicKey: string | null; devices: number; configurationError?: string };
type PushTestResult = { attempted: number; accepted: number; results: { status: number; accepted: boolean }[] };
function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}
export default function PushPilotPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<number | null>(null);
  async function api(method: 'GET' | 'POST' | 'PUT', body?: unknown) {
    const response = await fetch('/api/notifications/push', {
      method, credentials: 'include', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'No fue posible completar la operación');
    return data;
  }
  async function activate() {
    setBusy(true);
    setMessage('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
        throw new Error('Este navegador no admite Web Push. En iPhone instala MOTIL en la pantalla de inicio.');
      const status: Status = await api('GET');
      if (status.configurationError) throw new Error(status.configurationError);
      if (!status.publicKey) throw new Error('El administrador debe configurar Web Push en Vercel.');
      if (Notification.permission === 'denied') throw new Error('Notificaciones bloqueadas en el navegador.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('No se otorgó permiso para notificaciones.');
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const applicationServerKey = urlBase64ToUint8Array(status.publicKey);
      if (subscription) {
        const currentKey = subscription.options.applicationServerKey;
        const bytes = currentKey ? new Uint8Array(currentKey) : null;
        if (!bytes || bytes.length !== applicationServerKey.length ||
            bytes.some((byte, index) => byte !== applicationServerKey[index])) {
          throw new Error('La clave Web Push cambió. Presiona Restablecer suscripción de este navegador y vuelve a activar las notificaciones.');
        }
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as BufferSource,
        });
      }
      await api('POST', subscription.toJSON());
      const updated: Status = await api('GET');
      setDevices(updated.devices);
      setMessage('Dispositivo registrado. Puedes enviar la notificación de prueba.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error activando notificaciones');
    } finally { setBusy(false); }
  }
  async function resetBrowser() {
    setBusy(true);
    setMessage('');
    try {
      if (!('serviceWorker' in navigator)) throw new Error('Este navegador no admite notificaciones.');
      const registration = await navigator.serviceWorker.ready;
      const previous = await registration.pushManager.getSubscription();
      if (previous) {
        const removed = await previous.unsubscribe();
        if (!removed) throw new Error('El navegador no pudo cancelar la suscripción anterior.');
      }
      setDevices(null);
      setMessage('Suscripción local anterior cancelada. Presiona Activar notificaciones para registrar esta cuenta.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo restablecer este navegador');
    } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true);
    setMessage('');
    try {
      const result: PushTestResult = await api('PUT');
      const summary = `Proveedor Push: ${result.accepted} de ${result.attempted} envíos aceptados.`;
      const failures = result.results.filter((item) => !item.accepted)
        .map((item) => item.status === 0 ? 'sin respuesta (red o configuración)' : `HTTP ${item.status}`);
      setMessage([
        summary,
        result.accepted > 0
          ? 'La aceptación del proveedor no confirma recepción. Comprueba que el aviso aparezca y que al pulsarlo abra MOTIL.'
          : 'No se confirmó aceptación del proveedor.',
        failures.length ? `Fallos: ${failures.join(', ')}.` : '',
      ].filter(Boolean).join(' '));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error enviando notificación');
    } finally { setBusy(false); }
  }
  return <main className="mx-auto w-full min-w-0 max-w-lg space-y-6 overflow-x-hidden px-4 py-8">
    <div className="min-w-0"><p className="text-sm text-muted-foreground">MOTIL · Piloto</p><h1 className="break-words text-2xl font-semibold">Notificaciones a mi dispositivo</h1><p className="mt-2 break-words text-sm text-muted-foreground">Primero activa las notificaciones desde este teléfono o computador. Después prueba un aviso personal.</p></div>
    <div className="space-y-3">
      <Button className="w-full min-h-14" disabled={busy} onClick={() => void activate()}>1. Activar notificaciones</Button>
      <Button className="w-full min-h-14" variant="outline" disabled={busy} onClick={() => void test()}>2. Enviar prueba a mi dispositivo</Button>
      <Button className="w-full" variant="ghost" disabled={busy} onClick={() => void resetBrowser()}>Restablecer suscripción de este navegador</Button>
    </div>
    {devices !== null ? <p className="text-sm text-muted-foreground">Dispositivos activos: {devices}</p> : null}
    {message ? <p role="status" className="rounded-lg border p-4 text-sm">{message}</p> : null}
    <p className="text-xs text-muted-foreground">Si este navegador se usó con otra cuenta, restablece la suscripción antes de activarla. No modifica los datos de otros usuarios. Prueba habilitada exclusivamente para juan@n3uralia.com. Las notificaciones requieren permiso del dispositivo; iOS requiere instalar la PWA.</p>
  </main>;
}

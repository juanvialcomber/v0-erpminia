'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type ReceiptStatus = { testId: string; sentAt: string; providerStatus: number | null; receivedAt: string | null; displayedAt: string | null; clickedAt: string | null; displayError: string | null };
type Status = { publicKey: string | null; devices: number; configurationError?: string; pilot: boolean; receipts?: ReceiptStatus[] };
type PushTestResult = { attempted: number; accepted: number; results: { testId?: string; status: number; accepted: boolean }[] };
function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}
async function readyPushReceiver() {
  if (!('serviceWorker' in navigator)) throw new Error('Este navegador no admite notificaciones.');
  const registration = await new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('El receptor de avisos no está listo. Recarga MOTIL.')), 8000);
    navigator.serviceWorker.ready.then((value) => { window.clearTimeout(timer); resolve(value); },
      () => { window.clearTimeout(timer); reject(new Error('No fue posible preparar el receptor de avisos.')); });
  });
  await registration.update().catch(() => undefined);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      const finish = (value: boolean) => { window.clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(value); };
      const timer = window.setTimeout(() => finish(false), 500);
      channel.port1.onmessage = (event) => finish(event.data?.receipts === true);
      registration.active?.postMessage({ type: 'GET_PUSH_PILOT_CAPABILITIES' }, [channel.port2]);
    });
    if (ready) return registration;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error('El receptor de avisos se está actualizando. Recarga MOTIL y vuelve a probar.');
}

export default function PushPilotPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<ReceiptStatus[]>([]);
  useEffect(() => {
    let cancelled = false;
    void api('GET').then((status: Status) => {
      if (!cancelled) { setReceipts(status.receipts || []); setDevices(status.devices); }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  async function refreshReceiptStatus() {
    const status: Status = await api('GET');
    setReceipts(status.receipts || []);
    setDevices(status.devices);
    return status.receipts || [];
  }
  async function checkReceipt() {
    setBusy(true);
    try { await refreshReceiptStatus(); setMessage('Recepción actualizada. Un aviso creado aún necesita comprobación visual en Windows.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible revisar la recepción.'); }
    finally { setBusy(false); }
  }
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
      const registration = await readyPushReceiver();
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
      const registration = await readyPushReceiver();
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
  async function testLocal() {
    setBusy(true);
    setMessage('');
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator))
        throw new Error('Este navegador no admite notificaciones.');
      if (Notification.permission !== 'granted') throw new Error('Activa primero las notificaciones de MOTIL en Chrome.');
      const status: Status = await api('GET');
      if (!status.pilot) throw new Error('Prueba reservada al usuario piloto.');
      const registration = await readyPushReceiver();
      const options: NotificationOptions & { renotify: boolean } = {
        body: 'Este aviso se creó directamente en tu navegador. Pulsa para abrir MOTIL.',
        data: { url: '/dashboard' }, tag: 'motil-local-test',
        renotify: true, requireInteraction: true,
      };
      await registration.showNotification('MOTIL · Prueba en este equipo', options);
      setMessage('El navegador aceptó crear el aviso local. Si no aparece, revisa Windows → Sistema → Notificaciones: Chrome, banners y No molestar. Esto todavía no confirma recepción de un mensaje Push.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible mostrar el aviso local.');
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true);
    setMessage('');
    try {
      const registration = await readyPushReceiver();
      const subscription = await registration.pushManager.getSubscription();
      const result: PushTestResult = await api('PUT', subscription ? { endpoint: subscription.endpoint } : undefined);
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
      if (result.accepted > 0) {
        const testIds = new Set(result.results.filter((item) => item.accepted).map((item) => item.testId));
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          const tracked = (await refreshReceiptStatus()).filter((item) => testIds.has(item.testId));
          if (tracked.some((item) => item.displayError)) {
            setMessage(summary + ' El navegador recibió la prueba, pero su API no pudo crear el aviso.');
            break;
          }
          if (tracked.some((item) => item.displayedAt)) {
            setMessage(summary + ' El navegador confirmó la creación del aviso. Falta comprobar el banner y pulsarlo para abrir MOTIL.');
            break;
          }
          if (attempt === 4) setMessage(summary + ' Todavía no hay confirmación de recepción del navegador.');
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error enviando notificación');
    } finally { setBusy(false); }
  }
  return <main className="mx-auto w-full min-w-0 max-w-lg space-y-6 overflow-x-hidden px-4 py-8">
    <div className="min-w-0"><p className="text-sm text-muted-foreground">MOTIL · Piloto</p><h1 className="break-words text-2xl font-semibold">Notificaciones a mi dispositivo</h1><p className="mt-2 break-words text-sm text-muted-foreground">Primero activa las notificaciones desde este teléfono o computador. Después prueba un aviso personal.</p></div>
    <div className="space-y-3">
      <Button className="w-full min-h-14" disabled={busy} onClick={() => void activate()}>1. Activar notificaciones</Button>
      <Button className="w-full min-h-14" variant="outline" disabled={busy} onClick={() => void test()}>2. Enviar prueba a mi dispositivo</Button>
      <Button className="w-full" variant="outline" disabled={busy} onClick={() => void testLocal()}>Comprobar aviso en este equipo</Button>
      <Button className="w-full" variant="ghost" disabled={busy} onClick={() => void checkReceipt()}>Revisar recepción</Button>
      <Button className="w-full" variant="ghost" disabled={busy} onClick={() => void resetBrowser()}>Restablecer suscripción de este navegador</Button>
    </div>
    {devices !== null ? <p className="text-sm text-muted-foreground">Dispositivos activos: {devices}</p> : null}
    {receipts.length > 0 ? <section className="space-y-3 rounded-lg border p-4" aria-label="Recepción de la última prueba">
      <h2 className="text-sm font-semibold">Última prueba</h2>
      {receipts.slice(0, 1).map((receipt) => <div key={receipt.testId} className="space-y-1 text-sm">
        <p>Proveedor: {receipt.providerStatus === null ? 'sin respuesta confirmada' : receipt.providerStatus >= 200 && receipt.providerStatus < 300 ? 'aceptado' : receipt.providerStatus === 0 ? 'sin respuesta' : 'rechazado (HTTP ' + receipt.providerStatus + ')'}</p>
        <p>Navegador: {receipt.receivedAt || receipt.displayedAt || receipt.clickedAt ? 'recepción confirmada' : 'recepción sin confirmar'}</p>
        <p>Aviso: {receipt.displayError ? 'no se pudo crear' : receipt.displayedAt || receipt.clickedAt ? 'creado por el navegador' : 'creación sin confirmar'}</p>
        <p>Apertura: {receipt.clickedAt ? 'notificación pulsada' : 'sin pulsación confirmada'}</p>
      </div>)}
      <p className="text-xs text-muted-foreground">El aviso creado por el navegador no demuestra que Windows haya mostrado el banner.</p>
    </section> : null}
    {message ? <p role="status" className="rounded-lg border p-4 text-sm">{message}</p> : null}
    <p className="text-xs text-muted-foreground">Si este navegador se usó con otra cuenta, restablece la suscripción antes de activarla. No modifica los datos de otros usuarios. Prueba habilitada exclusivamente para juan@n3uralia.com. Las notificaciones requieren permiso del dispositivo; iOS requiere instalar la PWA.</p>
  </main>;
}

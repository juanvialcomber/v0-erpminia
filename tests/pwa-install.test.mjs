import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = await readFile(new URL('../app/manifest.ts', import.meta.url), 'utf8');
const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const installer = await readFile(new URL('../components/pwa/install-motil-button.tsx', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../components/layout/sidebar.tsx', import.meta.url), 'utf8');
const iconRoute = await readFile(new URL('../app/api/pwa/icon-192/route.tsx', import.meta.url), 'utf8');
const icon512Route = await readFile(new URL('../app/api/pwa/icon-512/route.tsx', import.meta.url), 'utf8');
const staticManifest = await readFile(new URL('../public/motil-v2.webmanifest', import.meta.url), 'utf8');
const legacyManifest = await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8');
const registrar = await readFile(new URL('../components/pwa/service-worker-registrar.tsx', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../public/motil-sw-v2.js', import.meta.url), 'utf8');
const nextConfig = await readFile(new URL('../next.config.js', import.meta.url), 'utf8');

test('MOTIL exposes an installable standalone web app manifest', () => {
  assert.match(manifest, /name: 'MOTIL Mining OS'/);
  assert.match(manifest, /short_name: 'MOTIL'/);
  assert.match(manifest, /start_url: '\/dashboard'/);
  assert.match(manifest, /display: 'standalone'/);
  assert.match(manifest, /sizes: '512x512'/);
  assert.match(manifest, /sizes: '512x512'/);
  assert.match(layout, /manifest: '\/manifest\.webmanifest'/);
  assert.match(layout, /appleWebApp/);
});

test('MOTIL install control supports Chromium prompts and Apple home-screen guidance', () => {
  assert.match(installer, /beforeinstallprompt/);
  assert.match(installer, /appinstalled/);
  assert.match(installer, /display-mode: standalone/);
  assert.match(installer, /Agregar a Inicio/);
  assert.match(installer, /Abrir como app web/);
  assert.match(installer, /Instalar app o Agregar a pantalla principal/);
  assert.match(sidebar, /InstallMotilButton locale=\{locale\}/);
});

test('MOTIL install icons render the canonical MOTIL wordmark at 192px and 512px', () => {
  assert.match(iconRoute, /MOTIL_WORDMARK/);
  assert.doesNotMatch(iconRoute, /arrayBuffer\(\)/);
  assert.match(iconRoute, /data:image\/png;base64/);
  assert.match(iconRoute, /width: 192/);
  assert.match(iconRoute, /height: 192/);
  assert.match(icon512Route, /MOTIL_WORDMARK/);
  assert.doesNotMatch(icon512Route, /arrayBuffer\(\)/);
  assert.match(icon512Route, /data:image\/png;base64/);
  assert.match(icon512Route, /width: 512/);
  assert.match(icon512Route, /height: 512/);
  assert.doesNotMatch(iconRoute, /icon-512\.png/);
  assert.doesNotMatch(icon512Route, /icon-512\.png/);
});


test('MOTIL registers a root-scoped service worker required by Chrome Android installability', () => {
  assert.match(layout, /PwaServiceWorkerRegistrar/);
  assert.match(layout, /mobile-web-app-capable/);
  assert.match(registrar, /navigator\.serviceWorker\.register\('\/motil-sw-v2\.js'/);
  assert.match(registrar, /scope: '\/'/);
  assert.match(registrar, /updateViaCache: 'none'/);
});

test('MOTIL service worker stays network-authoritative and removes only legacy sustainability caches', () => {
  assert.match(serviceWorker, /self\.addEventListener\('install'/);
  assert.match(serviceWorker, /self\.addEventListener\('activate'/);
  assert.match(serviceWorker, /self\.addEventListener\('fetch'/);
  assert.match(serviceWorker, /event\.respondWith\(fetch\(request\)\)/);
  assert.match(serviceWorker, /sostenibilidad-v2/);
  assert.match(serviceWorker, /sostenibilidad-api-v2/);
  assert.doesNotMatch(serviceWorker, /cache\.put/);
  assert.match(serviceWorker, /OFFLINE_SHELL_URL/);
  assert.match(serviceWorker, /cache\.match/);
  assert.doesNotMatch(serviceWorker, /cache\.put\(request/);
});


test('PWA control files are never cached as immutable at the edge', () => {
  assert.match(nextConfig, /source: '\/motil-sw-v2\.js'/);
  assert.match(nextConfig, /Service-Worker-Allowed/);
  assert.match(nextConfig, /source: '\/manifest\.webmanifest'/);
  assert.match(nextConfig, /no-store, no-cache, must-revalidate/);
  assert.doesNotMatch(nextConfig, /source: '\/:path\*'[\s\S]{0,1500}max-age=31536000, immutable/);
});

test('Android install prompt is captured globally before the sidebar button mounts', () => {
  assert.match(registrar, /__motilInstallPrompt/);
  assert.match(registrar, /motil-install-prompt-ready/);
  assert.match(installer, /__motilInstallPrompt/);
  assert.match(installer, /motil-install-prompt-ready/);
});


test('Android migrates away from stale legacy service worker registrations', () => {
  assert.match(registrar, /getRegistrations\(\)/);
  assert.match(registrar, /endsWith\('\/sw\.js'\)/);
  assert.match(registrar, /registration\.unregister\(\)/);
  assert.match(registrar, /motil-sw-v2\.js/);
  assert.match(serviceWorker, /MOTIL_SW_VERSION = 'motil-pwa-v3-push'/);
});


test('MOTIL favicon and install metadata use the proven original brand assets', () => {
  assert.match(layout, /icon-light-32x32\.png/);
  assert.match(layout, /icon-dark-32x32\.png/);
  assert.match(layout, /icon-512\.png/);
  assert.match(layout, /apple-icon\.png/);
  assert.match(manifest, /icon-512\.png\?brand=motil-original/);
  assert.match(staticManifest, /icon-512\.png\?brand=motil-original/);
  assert.match(legacyManifest, /icon-512\.png\?brand=motil-original/);
  assert.match(nextConfig, /source: '\/icon-512\.png'[\s\S]*?no-store, no-cache, must-revalidate/);
  assert.match(nextConfig, /source: '\/apple-icon\.png'[\s\S]*?no-store, no-cache, must-revalidate/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const shell = await readFile(new URL('../components/layout/dashboard-shell.tsx', import.meta.url), 'utf8');
const header = await readFile(new URL('../components/layout/header.tsx', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../components/layout/sidebar.tsx', import.meta.url), 'utf8');
const assistant = await readFile(new URL('../components/intelligence/senior-assistant-widget.tsx', import.meta.url), 'utf8');
const bottomNav = await readFile(new URL('../components/layout/mobile-bottom-nav.tsx', import.meta.url), 'utf8');
const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const systemCss = await readFile(new URL('../app/motil-system.css', import.meta.url), 'utf8');
const messages = await readFile(new URL('../components/messages/motil-messages.tsx', import.meta.url), 'utf8');
const calendar = await readFile(new URL('../components/calendar/operational-calendar.tsx', import.meta.url), 'utf8');

test('mobile shell exposes role-aware bottom navigation and safe content spacing', () => {
  assert.match(shell, /MobileBottomNav/);
  assert.match(shell, /safe-area-inset-bottom/);
  assert.match(bottomNav, /md:hidden/);
  assert.match(bottomNav, /mant_operaciones/);
  assert.match(bottomNav, /prod_operaciones/);
  assert.match(bottomNav, /bodega_inventario/);
  assert.match(bottomNav, /fin_compras/);
  assert.match(bottomNav, /fin_finanzas/);
});

test('mobile header and menu reserve safe areas without desktop clutter', () => {
  assert.match(header, /safe-area-inset-top/);
  assert.match(header, /sm:hidden/);
  assert.match(header, /hidden sm:block/);
  assert.match(sidebar, /safe-area-inset-top/);
  assert.match(sidebar, /size-10/);
});

test('assistant never overlaps the mobile bottom navigation', () => {
  assert.match(assistant, /safe-area-inset-bottom/);
  assert.match(assistant, /md:bottom-5/);
  assert.match(assistant, /72dvh/);
});

test('PWA viewport and shared controls are mobile hardened', () => {
  assert.match(layout, /viewportFit: 'cover'/);
  assert.match(layout, /width: 'device-width'/);
  assert.match(systemCss, /font-size: 16px/);
  assert.match(systemCss, /min-height: 2\.75rem/);
  assert.match(systemCss, /overscroll-behavior-x: contain/);
  assert.match(systemCss, /-webkit-overflow-scrolling: touch/);
});


test('messages use mobile viewport height and one-handed composer controls', () => {
  assert.match(messages, /100dvh/);
  assert.match(messages, /safe-area-inset-bottom/);
  assert.match(messages, /sm:resize-y/);
  assert.match(messages, /text-base/);
  assert.match(messages, /min-w-12/);
});

test('operational calendar stays compact and horizontally safe on mobile', () => {
  assert.match(calendar, /grid-cols-2/);
  assert.match(calendar, /overflow-x-auto/);
  assert.match(calendar, /scrollbar-width:none/);
  assert.match(calendar, /shrink-0/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as calendar from '../lib/maintenance/work-order-calendar-date.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const jsxRuntime = require('react/jsx-runtime');
const h = React.createElement;
const compiled = new Map();
const asset = { id: 'calendar-fixture-asset', asset_name: 'Equipo de prueba', asset_code: 'CAL-01' };

// Render the real TSX and calendar helper. Only I/O, navigation and visual
// primitives are replaced; no query or event handler can reach a live service.
const primitives = Object.fromEntries([
  'Badge', 'Button', 'Card', 'CardContent', 'CardDescription', 'CardHeader',
  'CardTitle', 'Label', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue',
].map((name) => [name, ({ children }) => h('div', null, children)]));
primitives.Input = () => h('input');
primitives.Textarea = () => h('textarea');
primitives.StatePanel = ({ title, description }) => h('section', null, title, description);

function styledJsx(factory) {
  return (type, props, key) => {
    // Next normally consumes these styling flags before React renders <style>.
    if (type === 'style') {
      props = { ...props };
      delete props.jsx;
      delete props.global;
    }
    return factory(type, props, key);
  };
}

function renderComponent(file, name, fixtures, props = {}) {
  if (!compiled.has(file)) {
    compiled.set(file, ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText);
  }
  const unexpectedIO = () => { throw new Error('Render fixtures must not perform I/O'); };
  const dependencies = {
    react: React,
    'react/jsx-runtime': { ...jsxRuntime, jsx: styledJsx(jsxRuntime.jsx), jsxs: styledJsx(jsxRuntime.jsxs) },
    'lucide-react': require('lucide-react'),
    sonner: { toast: { error: unexpectedIO, success: unexpectedIO } },
    swr: { default: (url) => ({ data: fixtures[url], isLoading: false, error: null, mutate: unexpectedIO }) },
    'next/link': { default: ({ children, href }) => h('a', { href: typeof href === 'string' ? href : href?.pathname }, children) },
    'next/navigation': {
      useParams: () => ({ id: asset.id }),
      useRouter: () => ({ push: unexpectedIO }),
      useSearchParams: () => new URLSearchParams(),
    },
    '@/lib/api-client': { apiFetch: unexpectedIO },
    '@/lib/maintenance/cost-center-machines': { inferMachineFamilyFromText: () => null },
    '@/lib/maintenance/work-order-calendar-date.mjs': calendar,
    '@/components/maintenance/technical-guideline-library': { TechnicalGuidelineLibrary: () => null },
  };
  const exports = {};
  runInNewContext(compiled.get(file), {
    exports, Date: globalThis.Date, URLSearchParams, fetch: unexpectedIO,
    require: (id) => {
      if (id.startsWith('@/components/ui/')) return primitives;
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      throw new Error('Unexpected render dependency: ' + id);
    },
  });
  return renderToStaticMarkup(h(exports[name], props));
}

function inTimezone(t, zone) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  t.after(() => { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; });
}

const visibleText = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const order = (id, scheduled_date) => ({
  id, work_order_id: id, work_order_number: id, asset_id: asset.id,
  status: 'open', title: 'Trabajo programado', scheduled_date,
  created_at: '2026-10-15T12:00:00Z',
});

test('mobile OT and equipment operations render the selected civil day in Santiago', (t) => {
  inTimezone(t, 'America/Santiago');
  const workOrders = [
    order('OT-CAL-01', '2026-10-23'), order('OT-CAL-02', '2026-10-23T00:00:00Z'), order('OT-CAL-03', '2026-02-29'),
  ];
  const fixtures = {
    '/api/maintenance/work-orders': { workOrders },
    [`/api/maintenance/assets/${asset.id}/operational-360`]: { workOrders },
  };
  for (const [file, name, props] of [
    ['maintenance-mobile-panel.tsx', 'MaintenanceMobilePanel', {}],
    ['asset-related-operations.tsx', 'AssetRelatedOperations', { assetId: asset.id }],
  ]) {
    const html = renderComponent('components/maintenance/' + file, name, fixtures, props);
    assert.equal(html.split('23-10-2026').length - 1, 2, name + ' must preserve both scheduled days');
    assert.ok(html.includes('Sin fecha programada'), name + ' must not manufacture a calendar day for an invalid date');
    assert.ok(!html.includes('22-10-2026'), name + ' must not shift a scheduled day into the previous date');
  }
});

test('QR recent OT distinguishes their schedule from creation and never invents a missing date', (t) => {
  inTimezone(t, 'America/Santiago');
  const fixtures = {
    [`/api/maintenance/assets/${asset.id}/history`]: { asset, history: [] },
    '/api/maintenance/work-orders': { workOrders: [
      order('OT-CAL-01', '2026-10-23'), order('OT-CAL-02', null), order('OT-CAL-03', '2026-02-29'),
    ] },
  };
  const html = renderComponent('components/maintenance/asset-qr-view.tsx', 'AssetQrView', fixtures, { scope: 'equipos' });
  assert.ok(html.includes('Programada: 23-10-2026'));
  assert.equal(html.split('Sin fecha programada').length - 1, 2);
  assert.ok(!html.includes('15-10-2026'), 'creation date must not replace the scheduled date');
  assert.ok(!html.includes('22-10-2026'), 'scheduled day must not shift in Santiago');
});

test('indicator overdue count changes at Chile midnight independently of the browser zone', (t) => {
  const previous = process.env.TZ;
  t.after(() => { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-19T02:59:59Z') });
  const fixtures = { '/api/maintenance/work-orders': { workOrders: [
    order('OT-YESTERDAY', '2026-10-17'), order('OT-TODAY', '2026-10-18'), order('OT-TOMORROW', '2026-10-19'),
    order('OT-NO-DATE', null), order('OT-INVALID', '2026-02-29'),
    { ...order('OT-CLOSED', '2026-10-17'), status: 'completed' },
  ] } };
  for (const zone of ['UTC', 'America/Santiago', 'Asia/Tokyo']) {
    process.env.TZ = zone;
    t.mock.timers.setTime(Date.parse('2026-10-19T02:59:59Z'));
    let text = visibleText(renderComponent('components/maintenance/maintenance-indicators-board.tsx', 'MaintenanceIndicatorsBoard', fixtures));
    assert.match(text, /Atrasadas 1\b/, zone + ': only yesterday is overdue before Chile midnight');
    t.mock.timers.tick(1000);
    text = visibleText(renderComponent('components/maintenance/maintenance-indicators-board.tsx', 'MaintenanceIndicatorsBoard', fixtures));
    assert.match(text, /Atrasadas 2\b/, zone + ': the former today becomes overdue at Chile midnight');
  }
});

test('preventive planning renders Chile today, DST day counts and validated long-range dates', (t) => {
  inTimezone(t, 'America/Santiago');
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-19T01:30:00Z') });
  for (const zone of ['UTC', 'America/Santiago']) {
    process.env.TZ = zone;
    for (const [instant, scheduled, expected] of [
      ['2026-10-19T01:30:00Z', '2026-10-18', 'Vence hoy'],
      ['2026-04-04T15:00:00Z', '2026-04-06', 'Vence en 2 días'],
      ['2026-09-07T15:00:00Z', '2026-09-05', 'Vencida hace 2 días'],
      ['2026-10-18T15:00:00Z', '2026-11-17', 'Vence en 30 días'],
      ['2026-10-18T15:00:00Z', '2026-11-18', '18-11-2026'],
      ['2026-10-18T15:00:00Z', '2026-02-29', 'Sin fecha válida'],
      ['2026-10-18T15:00:00Z', null, 'Sin fecha'],
    ]) {
      t.mock.timers.setTime(Date.parse(instant));
      const fixtures = { '/api/maintenance/preventive': { schedules: [{
        id: 'PLAN-CAL-01', asset_id: asset.id, asset, task_name: 'Plan calendario', enabled: true,
        next_scheduled_date: scheduled,
      }] } };
      const text = visibleText(renderComponent('components/maintenance/preventive-plan-board.tsx', 'PreventivePlanBoard', fixtures));
      assert.ok(text.includes(expected), `${zone}, ${instant}, scheduled ${scheduled}: expected ${expected}; received ${text}`);
    }
  }
});

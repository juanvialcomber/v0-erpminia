import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const page = await fs.readFile('components/dashboard/maintenance-home.tsx', 'utf8');
const dict = await fs.readFile('lib/i18n/dictionaries.ts', 'utf8');
const assistant = await fs.readFile('components/maintenance/maintenance-senior-assistant.tsx', 'utf8');

test('maintenance workspaces simplify progressively down the role chain', () => {
  assert.match(page, /leadership: \[/);
  assert.match(page, /planning: \[/);
  assert.match(page, /oversight: \[/);
  assert.match(page, /general: \[/);
  assert.match(page, /if \(mode === 'execution'\) \{/);
  assert.match(page, /<MobileTerrainPanel \/>/);
  assert.match(page, /mode === 'planning'\s*\? maintenanceFlow\.slice\(0, 3\)/s);
  assert.match(dict, /Planificar → Preparar → Ejecutar/);
});

test('maintenance planning queue stays focused on decisions that make work executable', () => {
  assert.match(page, /planningKinds = new Set\(\[[^\]]*'plan_step'[^\]]*'ready_to_close'[^\]]*'closure_evidence'[^\]]*\]\)/s);
  assert.match(dict, /Pendientes para planificar/);
  assert.match(dict, /Por asignar/);
  assert.match(dict, /Asignar trabajo/);
  assert.match(dict, /Qué debo dejar listo hoy/);
  assert.doesNotMatch(page, /Cola de ejecución/);
  assert.doesNotMatch(page, /executionKinds = new Set/);
});

test('maintenance leadership queue prioritizes actions that unblock and finish work', () => {
  assert.match(page, /leadershipKinds = new Set\(\[[^\]]*'plan_step'[^\]]*'ready_to_close'[^\]]*'closure_evidence'[^\]]*\]\)/s);
  assert.match(page, /rawActions\.filter\(\(action\) => leadershipKinds\.has\(action\.kind\)\)/);
  assert.match(dict, /Qué debo decidir hoy/);
  assert.match(dict, /Decisiones pendientes/);
  assert.match(page, /approval_needed/);
  assert.match(page, /supervisorInboxMode/);
  assert.match(dict, /Atender prioridad/);
});

test('maintenance transversal oversight is read-focused and does not inherit operational ownership', () => {
  assert.match(page, /oversightKinds = new Set\(\['operational_review', 'operational_blocker', 'reliability'\]\)/);
  assert.match(dict, /Equipos y trabajos a seguir/);
  assert.match(dict, /Revisar impacto/);
  assert.match(dict, /Sólo casos que pueden afectar otras áreas/);
  assert.match(page, /const showOwnedFlow = mode === 'planning' \|\| mode === 'leadership'/);
});

test('maintenance header exposes one secondary action and one role-aware primary action', () => {
  const actions = page.match(/<PageHeaderActions>(.*?)<\/PageHeaderActions>/s)?.[1] || '';
  assert.doesNotMatch(actions, /\{t\.refresh\}/);
  assert.equal((actions.match(/variant="outline"/g) || []).length, 0);
  assert.match(page, /data-testid="maintenance-more-details"/);
  const more = page.slice(page.indexOf('data-testid="maintenance-more-details"'));
  assert.match(more, /\{t\.refresh\}/);
});

test('maintenance header primary actions come from the dictionary', () => {
  for (const label of ['Asignar trabajo', 'Planificar', 'Atender prioridad', 'Revisar impacto', 'Revisar órdenes']) {
    assert.match(dict, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const actions = page.match(/<PageHeaderActions>(.*?)<\/PageHeaderActions>/s)?.[1] || '';
  assert.doesNotMatch(actions, />Crear orden</);
});

test('maintenance UI uses semantic theme tokens and no decorative hardcoded colors', () => {
  assert.doesNotMatch(page, /#[0-9a-fA-F]{3,8}/);
  assert.doesNotMatch(assistant, /#[0-9a-fA-F]{3,8}/);
  assert.match(assistant, /text-primary/);
  assert.match(assistant, /bg-background/);
});

test('floating maintenance assistant has accessible launcher and human authority copy', () => {
  assert.match(assistant, /aria-label="Abrir Asistente Senior de Mantenimiento"/);
  assert.match(assistant, /decisión humana/);
  assert.match(assistant, /Canónico/);
});

test('control center avoids duplicate direct row actions', () => {
  assert.doesNotMatch(page, /Ficha 360/);
  assert.match(page, /aria-label=\{t\.openActionAria\}/);
});

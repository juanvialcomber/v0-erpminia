import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prompts = readFileSync(new URL('../lib/motil-ai/skills/prompt-suggestions.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../app/api/motil-ai/skills/availability/route.ts', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../hooks/use-motil-skill-availability.ts', import.meta.url), 'utf8');
const widget = readFileSync(new URL('../components/intelligence/senior-assistant-widget.tsx', import.meta.url), 'utf8');

test('assistant prompts come only from available or degraded skills, never dormant skills', () => {
  assert.match(prompts, /state\.get\(key\) === 'available'/);
  assert.match(prompts, /state\.get\(key\) === 'degraded'/);
  assert.doesNotMatch(prompts, /state\.get\(key\) === 'dormant'/);
});

test('Laudus reconciliation prompt is skill-gated rather than globally visible', () => {
  assert.match(prompts, /laudus-source-reconciliation/);
  assert.match(prompts, /¿Qué datos de Laudus requieren conciliación antes de usarlos\?/);
});

test('availability endpoint exposes prompts by domain from runtime skills', () => {
  assert.match(api, /suggestedPromptsForDomain/);
  assert.match(api, /promptsByDomain/);
});

test('assistant widget consumes skill-aware prompts while preserving special-role prompts', () => {
  assert.match(widget, /useMotilSkillAvailability/);
  assert.match(widget, /contextualStarters/);
  assert.match(widget, /roleProfile\?\.starters/);
  assert.match(widget, /engineeringPrompts/);
  assert.match(widget, /skillAvailability\.promptsFor/);
  assert.match(hook, /promptsFor/);
});

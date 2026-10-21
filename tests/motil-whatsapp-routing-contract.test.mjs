import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routing = readFileSync(new URL('../lib/maintenance/whatsapp-review-routing.ts', import.meta.url), 'utf8');

test('WhatsApp classifier suggests multiple modules and requires review', () => {
  assert.match(routing, /Set<ReviewDestination>/);
  for (const module of ['planta','mina','despacho','mantenimiento','bodega','laboratorio']) {
    assert.match(routing, new RegExp("destinations.add\\('"+module+"'\\)"));
  }
  assert.match(routing, /requires_human_review: true/);
  assert.match(routing, /publication_allowed: false/);
  assert.match(routing, /needs_media_review: needsMediaReview/);
});

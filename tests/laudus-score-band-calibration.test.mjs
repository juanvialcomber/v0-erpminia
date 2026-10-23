import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/integrations/laudus/match-reviews/route.ts','utf8');
const inbox=fs.readFileSync('components/integrations/laudus-match-review-inbox.tsx','utf8');

test('Laudus feedback exposes observed score-band calibration without changing scoring',()=>{
  assert.match(route,/scoreBands/);
  assert.match(route,/90\+/);
  assert.match(route,/80-89/);
  assert.match(route,/70-79/);
  assert.match(route,/<70/);
  assert.match(route,/appliesToScoring: false/);
  assert.match(inbox,/Aceptación/);
  assert.match(inbox,/Score \{band\.band\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/maintenance/my-work/route.ts','utf8');

test('my-work resolves auth UUID through canonical profile identity bridge',()=>{
  assert.match(route,/auth_profile_identity_links/);
  assert.match(route,/context\.authUserId/);
  assert.match(route,/profileIds = new Set<string>/);
  assert.match(route,/\.in\('profile_id', Array\.from\(profileIds\)\)/);
});

test('my-work identity resolution remains tenant scoped and fail closed',()=>{
  assert.match(route,/organization_id', context\.organizationId/);
  assert.match(route,/employment_status', 'active'/);
  assert.match(route,/uniqueProfiles\.size !== 1/);
  assert.match(route,/uniquePeople\.size > 1/);
  assert.match(route,/más de una persona operativa activa/);
});

test('my-work uses resolved operational person for assignment lookup',()=>{
  assert.match(route,/resolvedPerson\.id/);
  assert.match(route,/assigned_person_id', resolvedPerson\.id/);
});

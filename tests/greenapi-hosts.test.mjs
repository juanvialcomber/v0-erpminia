import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../lib/messages/greenapi-host.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const hostModule = { exports: {} };
runInNewContext(compiled, { exports: hostModule.exports });
const { isAllowedGreenApiHost } = hostModule.exports;

test('Green API allows its instance-specific numeric API host over HTTPS', () => {
  assert.equal(isAllowedGreenApiHost('7107.api.greenapi.com'), true);
  assert.equal(isAllowedGreenApiHost('api.green-api.com'), true);
  assert.equal(isAllowedGreenApiHost('api.greenapi.com'), true);
  assert.equal(isAllowedGreenApiHost('evil.api.greenapi.com'), false);
  assert.equal(isAllowedGreenApiHost('api.greenapi.com.attacker.example'), false);
});

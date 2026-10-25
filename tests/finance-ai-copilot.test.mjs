import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const assistant = fs.readFileSync('lib/intelligence/operational-domain-assistant.ts','utf8');
const financeRoute = fs.readFileSync('app/api/finance/assistant/route.ts','utf8');
const finance = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
const proxy = fs.readFileSync('proxy.ts','utf8');

test('Daniel finance AI is grounded in canonical finance, forecast, aging and Laudus review evidence',()=>{
  assert.match(assistant,/canonical_finance_overview/);
  assert.match(assistant,/canonical_finance_suppliers/);
  assert.match(assistant,/procurement_accounts_payable_aging_summary_v1/);
  assert.match(assistant,/procurement_cash_forecast_summary_v1/);
  assert.match(assistant,/motil_laudus_finance_review_queue/);
  assert.match(assistant,/Laudus es fuente financiera trazable/);
});

test('finance AI keeps contractual forecast separate from statistical prediction',()=>{
  assert.match(assistant,/Forecast contractual basado en CxP y fechas de vencimiento conocidas/);
  assert.match(assistant,/No es predicción estadística/);
  assert.match(assistant,/Nunca inventar confianza/);
  assert.match(finance,/Predicción estadística/);
  assert.match(finance,/En calibración/);
});

test('Daniel gets one-tap executive questions with provenance and conversational continuity',()=>{
  assert.match(finance,/Qué revisar/);
  assert.match(finance,/Qué viene/);
  assert.match(finance,/Fuera de patrón/);
  assert.match(finance,/Evidencia: \{aiSources\.join/);
  assert.match(finance,/conversationId: aiConversationId/);
  assert.match(finance,/Pregunta sobre caja, proveedores o vencimientos/);
  assert.match(finance,/setAiConversationId/);
  assert.match(finance,/\/api\/finance\/assistant/);
  assert.match(financeRoute,/MODULE_KEYS\.FIN_FINANZAS/);
  assert.doesNotMatch(proxy,/path === '\/api\/intelligence\/executive-assistant'/);
});

test('finance copilot remains advisory and read only',()=>{
  assert.match(assistant,/No ejecutes compras, reservas, ajustes de stock, recepciones, aprobaciones, cambios de plan, cierres, pagos/);
  assert.match(assistant,/Puedes preparar una recomendación para validación humana/);
  assert.match(assistant,/no presentes a MOTIL como reemplazo contable/);
});

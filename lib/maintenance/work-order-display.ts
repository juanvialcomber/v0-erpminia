import type { Locale } from '@/lib/i18n/dictionaries';

export function formatWorkOrderNumber(value: string | null | undefined, _locale: Locale = 'es') {
  const number = String(value || '').trim();
  if (!number) return 'OT';
  return number.replace(/^OTE-/i, 'OTe-').replace(/^WO-/i, 'OT-');
}

export function formatWorkOrderText(value: string | null | undefined, _locale: Locale = 'es') {
  const text = String(value || '');
  return text.replace(/\bWO-/gi, 'OT-');
}

export function formatAssetIdentity(
  name: string | null | undefined,
  code: string | null | undefined,
) {
  const assetName = String(name || '').trim();
  const assetCode = String(code || '').trim();
  if (!assetName && !assetCode) return '';
  if (!assetName) return assetCode;
  if (!assetCode) return assetName;
  if (assetName.toLocaleLowerCase('es') === assetCode.toLocaleLowerCase('es')) return assetName;
  return `${assetCode} · ${assetName}`;
}

export function formatPriorityLabel(value: string | null | undefined, locale: Locale = 'es') {
  const priority = String(value || '').trim().toLowerCase();
  if (locale === 'en') {
    if (priority === 'critical') return 'Critical';
    if (priority === 'high') return 'High';
    if (priority === 'medium') return 'Medium';
    if (priority === 'low') return 'Low';
    return priority || 'No priority';
  }
  if (priority === 'critical' || priority === 'urgente') return 'Crítica';
  if (priority === 'high' || priority === 'alta') return 'Alta';
  if (priority === 'medium' || priority === 'media') return 'Media';
  if (priority === 'low' || priority === 'baja') return 'Baja';
  return priority || 'Sin prioridad';
}

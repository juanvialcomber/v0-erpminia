export const AUTHORIZED_MAINTENANCE_REVIEWER_NAMES = new Set([
  'Ariel López',
  'Mauricio Astudillo',
]);

export function isAuthorizedMaintenanceReviewerName(name: string | null | undefined) {
  return AUTHORIZED_MAINTENANCE_REVIEWER_NAMES.has(String(name || '').trim());
}

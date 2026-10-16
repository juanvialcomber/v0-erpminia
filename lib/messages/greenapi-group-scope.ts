/**
 * A daily report is an interpretation of the group allowlist at generation.
 * If a group was disabled after generation, its historical contribution can
 * no longer be safely shown without an explicit new source-scoped analysis.
 * Never delete or rewrite the canonical cached report.
 */
export type WhatsappGroupScope = {
  enabled: boolean;
  updated_at: string | null;
};

export type WhatsappCachedReport = {
  generated_at: string | null;
  message_count: number;
  findings: unknown[];
  summary: string | null;
  status: string;
};

export function redactDisallowedWhatsappReports<T extends WhatsappCachedReport>(
  reports: T[], groups: WhatsappGroupScope[],
): Array<T & { source_scope_stale: boolean }> {
  const disabled = groups.filter(group => !group.enabled);
  return reports.map(report => {
    const time = Date.parse(report.generated_at || '');
    const sourceScopeStale = disabled.some(group => {
      const changed = Date.parse(group.updated_at || '');
      return !Number.isFinite(time) || !Number.isFinite(changed) || changed > time;
    });
    return sourceScopeStale
      ? {
          ...report,
          source_scope_stale: true,
          status: 'scope_changed',
          message_count: 0,
          findings: [],
          summary: 'Resumen oculto por un cambio posterior en los grupos autorizados. Requiere regeneración.',
        }
      : { ...report, source_scope_stale: false };
  });
}


/**
 * Excluded operational source identified by the verified WhatsApp chat ID,
 * never by a mutable group name. Historical source records stay archived.
 */
const MOTIL_EXCLUDED_GROUP_CHAT_IDS = new Set([
  '120363427917216825@g.us', // Archived maintenance software-support chat
]);

export function isExcludedMotilWhatsappGroup(chatId: string | null | undefined): boolean {
  return typeof chatId === 'string' && MOTIL_EXCLUDED_GROUP_CHAT_IDS.has(chatId);
}

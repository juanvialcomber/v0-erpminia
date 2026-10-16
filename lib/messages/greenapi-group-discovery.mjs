// GREEN API returns both modern group IDs (digits@g.us) and historical
// WhatsApp IDs (digits-digits@g.us). Both are valid provider identities.
export function isGreenApiGroupId(value) {
  return typeof value === 'string' &&
    /^(?:\d{5,30}|\d{5,20}-\d{1,20})@g\.us$/.test(value);
}

function groupName(row, id) {
  const candidates = [row?.name, row?.contactName, row?.subject];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().slice(0, 120);
    }
  }
  return id;
}

// Both inputs must be raw arrays from the same authorized GREEN API instance.
// Never trust names as identities; only the exact provider chat ID deduplicates.
export function normalizeGreenApiGroupDiscovery(chats, contacts, maxGroups = 500) {
  const groupsById = new Map();
  for (const rows of [contacts, chats]) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const id = row.id ?? row.chatId ?? row.groupId;
      if (!isGreenApiGroupId(id)) continue;
      if (row.type && row.type !== 'group') continue;
      const name = groupName(row, id);
      const current = groupsById.get(id);
      // Prefer a human-readable name to an unrecognized/empty label.
      if (!current || (current.name === id && name !== id) ||
          (name !== id && rows === chats)) {
        groupsById.set(id, { chatId: id, name });
      }
    }
  }
  const all = [...groupsById.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) ||
    a.chatId.localeCompare(b.chatId)
  );
  const cap = Number.isInteger(maxGroups) && maxGroups > 0 ? maxGroups : 500;
  return { groups: all.slice(0, cap), total: all.length, truncated: all.length > cap };
}

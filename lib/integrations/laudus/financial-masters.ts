export function extractLaudusListRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)),
    );
  }

  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;

  for (const key of ['data', 'items', 'results', 'rows']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter(
        (row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)),
      );
    }
  }

  return [];
}

export function hasLaudusPageMore(rows: unknown[], pageSize: number) {
  return rows.length >= pageSize;
}

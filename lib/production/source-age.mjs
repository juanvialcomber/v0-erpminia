// Compare source-only calendar dates without depending on the browser timezone.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function utcDay(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time;
}

export function sourceAgeDays(sourceDate, asOfDate) {
  const source = utcDay(sourceDate);
  const asOf = utcDay(asOfDate);
  if (source === null || asOf === null) return null;
  return Math.round((asOf - source) / DAY_MS);
}

export function sourceFreshnessStatus(ageDays, staleAfterDays = 7) {
  if (ageDays === null || !Number.isFinite(ageDays)) return 'unknown';
  if (ageDays < 0) return 'future';
  return ageDays > staleAfterDays ? 'outdated' : 'recent';
}

export function chileTodayISO(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

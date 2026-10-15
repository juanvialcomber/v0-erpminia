// A scheduled work-order date is a calendar day, never a UTC instant.
// Parsing YYYY-MM-DD with new Date(value) shifts it back one day in Chile.
export function normalizeWorkOrderDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(String(value || ''));
  if (!match) return null;
  const key = `${match[1]}-${match[2]}-${match[3]}`;
  const valid = new Date(`${key}T12:00:00Z`);
  return Number.isFinite(valid.getTime()) && valid.toISOString().slice(0, 10) === key ? key : null;
}

export function chileTodayDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function formatWorkOrderDate(value, locale = 'es-CL') {
  const key = normalizeWorkOrderDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-');
  return locale === 'en-US' ? `${month}/${day}/${year}` : `${day}-${month}-${year}`;
}

export function daysUntilWorkOrderDate(value, today = chileTodayDateKey()) {
  const dateKey = normalizeWorkOrderDateKey(value);
  const todayKey = normalizeWorkOrderDateKey(today);
  if (!dateKey || !todayKey) return null;
  // UTC day arithmetic avoids daylight-saving transitions in Santiago.
  const toUtcDay = (key) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtcDay(dateKey) - toUtcDay(todayKey)) / 86400000);
}

export function isWorkOrderScheduledOverdue(value, today = chileTodayDateKey()) {
  const days = daysUntilWorkOrderDate(value, today);
  return days !== null && days < 0;
}

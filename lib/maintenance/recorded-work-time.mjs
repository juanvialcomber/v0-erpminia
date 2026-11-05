/**
 * Work-order execution time is the persisted active-timer duration when present.
 * Equipment downtime is a distinct metric and must never inflate worked hours.
 * If no timer was recorded, use explicitly declared or previously validated hours.
 */
export function resolveRecordedWorkHours({
  totalTimerSeconds = 0,
  totalTimerMinutes = 0,
  manualHours = null,
  storedHours = 0,
} = {}) {
  const seconds = Number(totalTimerSeconds);
  const minutes = Number(totalTimerMinutes);
  const validSeconds = Math.max(
    Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
    Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 0,
  );
  if (validSeconds > 0) return validSeconds / 3600;

  const submitted = Number(manualHours);
  if (Number.isFinite(submitted) && submitted > 0) return submitted;

  const previous = Number(storedHours);
  return Number.isFinite(previous) && previous > 0 ? previous : 0;
}

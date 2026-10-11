export type MeterSample = { meter_hours: number; recorded_at: string };
export type MeterCheck = { status: 'ok' | 'review'; reason: string | null; deltaHours: number | null; elapsedHours: number | null };

// A running hour meter cannot increase by more than elapsed wall-clock hours.
// Small timing differences are allowed for clock drift, rounding and delayed collection.
export function checkMeterConsistency(previous: MeterSample | null, current: MeterSample): MeterCheck {
  if (!Number.isFinite(current.meter_hours) || current.meter_hours < 0 ||
      !Number.isFinite(Date.parse(current.recorded_at))) {
    return { status: 'review', reason: 'invalid_reading', deltaHours: null, elapsedHours: null };
  }
  if (!previous) return { status: 'ok', reason: null, deltaHours: null, elapsedHours: null };
  const elapsedHours = (Date.parse(current.recorded_at) - Date.parse(previous.recorded_at)) / 3600000;
  const deltaHours = current.meter_hours - previous.meter_hours;
  if (deltaHours < 0) return { status: 'review', reason: 'meter_decrease', deltaHours, elapsedHours };
  if (elapsedHours <= 0) return { status: 'review', reason: 'non_increasing_timestamp', deltaHours, elapsedHours };
  if (deltaHours > elapsedHours + 1) {
    return { status: 'review', reason: 'physically_impossible_increase', deltaHours, elapsedHours };
  }
  return { status: 'ok', reason: null, deltaHours, elapsedHours };
}

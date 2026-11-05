export interface RecordedWorkHoursInput {
  totalTimerSeconds?: number | string | null;
  totalTimerMinutes?: number | string | null;
  manualHours?: number | string | null;
  storedHours?: number | string | null;
}
export declare function resolveRecordedWorkHours(input?: RecordedWorkHoursInput): number;

export function normalizeWorkOrderDateKey(value: string | null | undefined): string | null;
export function chileTodayDateKey(now?: Date): string;
export function formatWorkOrderDate(value: string | null | undefined, locale?: string): string | null;
export function daysUntilWorkOrderDate(value: string | null | undefined, today?: string): number | null;
export function isWorkOrderScheduledOverdue(value: string | null | undefined, today?: string): boolean;

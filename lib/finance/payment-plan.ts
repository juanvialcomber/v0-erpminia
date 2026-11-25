type Payable = { currency: string; outstanding_amount: number; due_date?: string | null };
type Bucket = { count: number; amount: number };
type Group = {
  currency: string; overdue: Bucket; nextSevenDays: Bucket; days8to15: Bucket;
  days16to30: Bucket; days31to90: Bucket; beyond90: Bucket; undated: Bucket;
};
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const empty = (): Bucket => ({ count: 0, amount: 0 });
function epochDay(value: string | null | undefined): number | null {
  if (!value || !datePattern.test(value)) return null;
  const time = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== value) return null;
  return time / 86400000;
}
export function buildPaymentPlan(rows: Payable[], today: string): Group[] {
  const start = epochDay(today);
  if (start === null) return [];
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const amount = Number(row.outstanding_amount);
    const currency = row.currency?.trim().toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(amount) || amount <= 0) continue;
    const due = epochDay(row.due_date);
    const days = due === null ? null : due - start;
    const bucket = days === null ? 'undated' : days < 0 ? 'overdue' :
      days <= 7 ? 'nextSevenDays' : days <= 15 ? 'days8to15' :
      days <= 30 ? 'days16to30' : days <= 90 ? 'days31to90' : 'beyond90';
    const group = groups.get(currency) || {
      currency, overdue: empty(), nextSevenDays: empty(), days8to15: empty(),
      days16to30: empty(), days31to90: empty(), beyond90: empty(), undated: empty(),
    };
    group[bucket].count++;
    group[bucket].amount += amount;
    groups.set(currency, group);
  }
  return [...groups.values()].sort((a,b) => a.currency.localeCompare(b.currency));
}

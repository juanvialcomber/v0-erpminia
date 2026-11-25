type Payable = { currency: string; outstanding_amount: number; due_date?: string | null };
type Bucket = { count: number; amount: number };
type Group = { currency: string; overdue: Bucket; nextSevenDays: Bucket; undated: Bucket };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const empty = (): Bucket => ({ count: 0, amount: 0 });

export function buildPaymentPlan(rows: Payable[], today: string): Group[] {
  if (!datePattern.test(today)) return [];
  const cutoff = new Date(today + 'T00:00:00Z');
  if (!Number.isFinite(cutoff.getTime())) return [];
  cutoff.setUTCDate(cutoff.getUTCDate() + 7);
  const end = cutoff.toISOString().slice(0, 10);
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const amount = Number(row.outstanding_amount);
    const currency = row.currency?.trim().toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(amount) || amount <= 0) continue;
    const due = row.due_date?.slice(0, 10);
    const valid = Boolean(due && datePattern.test(due) && Number.isFinite(Date.parse(due + 'T00:00:00Z')));
    const bucket = !valid ? 'undated' : due! < today ? 'overdue' : due! <= end ? 'nextSevenDays' : null;
    if (!bucket) continue;
    const group = groups.get(currency) || { currency, overdue: empty(), nextSevenDays: empty(), undated: empty() };
    group[bucket].count++;
    group[bucket].amount += amount;
    groups.set(currency, group);
  }
  return [...groups.values()].sort((a,b) => a.currency.localeCompare(b.currency));
}

/** La Patagua tenant: only company mailboxes and the existing N3uralia administrator. */
export function isAuthorizedPataguaEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return false;
  if (email.startsWith('demo@')) return false;
  return email.endsWith('@lapatagua.cl') || email === 'juan@n3uralia.com';
}

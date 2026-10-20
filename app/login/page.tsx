import { redirect } from 'next/navigation';

export default async function PublicLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/auth/login')
    ? next
    : null;
  redirect(destination ? `/auth/login?redirect=${encodeURIComponent(destination)}` : '/auth/login');
}

import { notFound } from 'next/navigation';
import { runLaudusReadOnlyValueProbe } from '@/lib/integrations/laudus/client';

export const dynamic = 'force-dynamic';

export default async function LaudusValueProbePage() {
  if (process.env.VERCEL_ENV !== 'preview') notFound();

  let result: unknown;
  try {
    result = await runLaudusReadOnlyValueProbe();
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error
      ? Number((error as { status?: number }).status) || 502
      : 502;
    result = { authenticated: false, persisted: false, redacted: true, upstreamStatus: status };
  }

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <h1 className="text-xl font-semibold">Laudus read-only value probe</h1>
      <p className="mt-2 text-sm text-muted-foreground">Preview only · no source values persisted or displayed.</p>
      <pre className="mt-6 overflow-auto rounded-md border p-4 text-xs">{JSON.stringify(result, null, 2)}</pre>
    </main>
  );
}

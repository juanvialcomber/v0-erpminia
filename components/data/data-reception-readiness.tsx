import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type ReadinessItem = {
  label: string;
  ready: boolean;
  detail: string;
};

export function DataReceptionReadiness({
  title = 'Preparado para nuevas fuentes',
  description,
  items,
  href = '/dashboard/calidad-datos',
}: {
  title?: string;
  description: string;
  items: ReadinessItem[];
  href?: string;
}) {
  const readyCount = items.filter((item) => item.ready).length;
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            <Badge variant="secondary">{readyCount}/{items.length}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Ver calidad<ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border px-3 py-3">
            <div className="flex items-center gap-2">
              {item.ready ? <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
              <p className="text-sm font-medium">{item.label}</p>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

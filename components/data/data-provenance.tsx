import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DataProvenance({
  source,
  updatedAt,
  className,
}: {
  source: string;
  updatedAt?: string | null;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Database className="h-3.5 w-3.5" />
      <span>{source}</span>
      {updatedAt ? <span aria-hidden="true">·</span> : null}
      {updatedAt ? <span>{updatedAt}</span> : null}
    </span>
  );
}

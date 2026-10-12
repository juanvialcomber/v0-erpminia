'use client';

/** Layout-preserving skeletons for the MOTIL communications cockpit. */
export function MessagesInboxSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="grid h-[min(74vh,760px)] min-h-[430px] overflow-hidden rounded-xl border bg-card md:min-h-[520px] md:grid-cols-[270px_minmax(0,1fr)]">
      <div className="space-y-4 border-r p-4">
        <div className="h-10 rounded-md bg-muted/70 motion-safe:animate-pulse" />
        {[0, 1, 2, 3, 4].map((item) => <div key={item} className="flex items-center gap-3 py-2">
          <div className="h-9 w-9 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2"><div className="h-3 w-2/3 rounded bg-muted motion-safe:animate-pulse" /><div className="h-2.5 w-4/5 rounded bg-muted/60 motion-safe:animate-pulse" /></div>
        </div>)}
      </div>
      <div className="hidden min-w-0 flex-col md:flex">
        <div className="flex h-16 items-center gap-3 border-b px-5"><div className="h-9 w-9 rounded-full bg-muted motion-safe:animate-pulse" /><div className="h-4 w-40 rounded bg-muted motion-safe:animate-pulse" /></div>
        <div className="flex flex-1 flex-col justify-end gap-5 p-6">
          <div className="h-14 w-2/3 rounded-xl bg-muted/60 motion-safe:animate-pulse" />
          <div className="ml-auto h-16 w-3/5 rounded-xl bg-muted motion-safe:animate-pulse" />
          <div className="h-12 w-1/2 rounded-xl bg-muted/60 motion-safe:animate-pulse" />
        </div>
        <div className="h-20 border-t p-4"><div className="h-11 rounded-lg bg-muted/70 motion-safe:animate-pulse" /></div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function MessagesHistorySkeleton({ label }: { label: string }) {
  return <div role="status" aria-busy="true" aria-label={label} className="space-y-5 py-6">
    <span className="sr-only">{label}</span>
    <div className="h-3 w-24 mx-auto rounded bg-muted/70 motion-safe:animate-pulse" />
    <div className="h-16 w-[68%] rounded-xl bg-muted motion-safe:animate-pulse" />
    <div className="ml-auto h-14 w-[58%] rounded-xl bg-muted/80 motion-safe:animate-pulse" />
    <div className="h-12 w-[46%] rounded-xl bg-muted motion-safe:animate-pulse" />
  </div>;
}

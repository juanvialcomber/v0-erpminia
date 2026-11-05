import * as React from 'react'

import { cn } from '@/lib/utils'

function FilterToolbar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="filter-toolbar"
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-3 md:flex-row md:items-center md:justify-between',
        className,
      )}
      {...props}
    />
  )
}

function FilterToolbarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="filter-toolbar-group" className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-2', className)} {...props} />
}

function FilterToolbarActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="filter-toolbar-actions" className={cn('flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2 overflow-x-auto md:w-auto md:overflow-visible', className)} {...props} />
}

function FilterToolbarMeta({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="filter-toolbar-meta" className={cn('flex flex-wrap items-center gap-2 text-xs text-muted-foreground', className)} {...props} />
}

export { FilterToolbar, FilterToolbarActions, FilterToolbarGroup, FilterToolbarMeta }

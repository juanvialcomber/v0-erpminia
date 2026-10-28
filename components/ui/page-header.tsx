import * as React from 'react'

import { cn } from '@/lib/utils'

function PageHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="page-header"
      className={cn('flex flex-col gap-3 border-b border-border/60 pb-4 md:flex-row md:items-end md:justify-between', className)}
      {...props}
    />
  )
}

function PageHeaderContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="page-header-content" className={cn('min-w-0 max-w-3xl', className)} {...props} />
}

function PageHeaderEyebrow({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="page-header-eyebrow" className={cn('mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground', className)} {...props} />
}

function PageHeaderTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return <h1 data-slot="page-header-title" className={cn('text-2xl font-semibold leading-tight tracking-[-0.025em] text-foreground', className)} {...props} />
}

function PageHeaderDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="page-header-description" className={cn('mt-1.5 max-w-2xl text-sm leading-5 text-muted-foreground', className)} {...props} />
}

function PageHeaderActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="page-header-actions" className={cn('flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto md:justify-end [&>[data-slot=button]]:min-w-0 [&>[data-slot=button]]:flex-1 sm:[&>[data-slot=button]]:flex-none', className)} {...props} />
}

export {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
}

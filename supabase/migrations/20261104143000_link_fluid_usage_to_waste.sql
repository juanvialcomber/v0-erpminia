begin;

alter table public.maintenance_waste_records
  add column if not exists source_fluid_usage_id uuid null
    references public.maintenance_fluid_usage_records(id) on delete restrict;

create unique index if not exists maintenance_waste_source_fluid_usage_uidx
  on public.maintenance_waste_records(organization_id, source_fluid_usage_id)
  where source_fluid_usage_id is not null;

create index if not exists maintenance_waste_source_fluid_usage_idx
  on public.maintenance_waste_records(source_fluid_usage_id)
  where source_fluid_usage_id is not null;

comment on column public.maintenance_waste_records.source_fluid_usage_id is
  'Optional canonical link to the fluid usage record that generated this maintenance waste. Quantity remains explicitly reported and is never inferred from fluid input.';

commit;

begin;

alter table public.contracts
  alter column start_date drop not null,
  alter column end_date drop not null;

commit;

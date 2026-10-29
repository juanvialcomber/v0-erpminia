begin;

alter table public.data_reconciliation_reviews
  drop constraint if exists data_reconciliation_reviews_entity_type_check;

alter table public.data_reconciliation_reviews
  add constraint data_reconciliation_reviews_entity_type_check
  check (
    entity_type = any (
      array[
        'product'::text,
        'supplier'::text,
        'asset'::text,
        'person'::text,
        'inventory'::text,
        'work_order'::text,
        'purchase_order'::text,
        'invoice'::text,
        'cost_center'::text,
        'warehouse'::text,
        'external_source'::text
      ]
    )
  );

commit;

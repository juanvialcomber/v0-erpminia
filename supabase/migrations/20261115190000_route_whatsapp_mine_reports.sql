-- Targeted, idempotent routing correction. Does not alter canonical assets or KPI values.
-- All ten rows were verified against the operational descriptions and source group.
DO $$
DECLARE matched_count integer;
BEGIN
  SELECT count(*) INTO matched_count
  FROM public.motil_whatsapp_module_updates_v1
  WHERE id IN (
    '5c5db199-e597-4f68-990a-f4ad103ec74a',
    '84eab489-2278-408c-b449-ebc90933b9f8',
    '6d3262c4-d91b-41db-a5ee-ce24542ae5b8',
    '5e81bc4b-9f7e-42e2-88ac-90be71d72b80',
    '14d04945-6554-4bd7-9ca7-d9d69db289c2',
    '6e47f1cf-f674-4d3f-83da-d54b046ed381',
    'eb47edd6-6206-4ae6-9443-f6c10933780f',
    '312ed07b-dd38-42b7-a773-7cfc29fbcc29',
    '04a99052-b23a-461e-ad32-ba49c68d0161',
    'ed2d11f1-85b1-45bf-8593-39f2e073e542'
  )
  AND whatsapp_group = 'Grupo 2'
  AND area IN ('Mina San Pedro','Mina Peumo','Mina Don Jaime','Mina Raíz del Cobre')
  AND destination_module IN ('sin_clasificar','mina');
  IF matched_count <> 10 THEN
    RAISE EXCEPTION 'Expected exactly 10 verified mine source rows; found %',matched_count;
  END IF;

  UPDATE public.motil_whatsapp_module_updates_v1
  SET destination_module = 'mina'
  WHERE id IN (
    '5c5db199-e597-4f68-990a-f4ad103ec74a',
    '84eab489-2278-408c-b449-ebc90933b9f8',
    '6d3262c4-d91b-41db-a5ee-ce24542ae5b8',
    '5e81bc4b-9f7e-42e2-88ac-90be71d72b80',
    '14d04945-6554-4bd7-9ca7-d9d69db289c2',
    '6e47f1cf-f674-4d3f-83da-d54b046ed381',
    'eb47edd6-6206-4ae6-9443-f6c10933780f',
    '312ed07b-dd38-42b7-a773-7cfc29fbcc29',
    '04a99052-b23a-461e-ad32-ba49c68d0161',
    'ed2d11f1-85b1-45bf-8593-39f2e073e542'
  )
  AND destination_module = 'sin_clasificar'
  AND whatsapp_group = 'Grupo 2'
  AND area IN ('Mina San Pedro','Mina Peumo','Mina Don Jaime','Mina Raíz del Cobre');
END $$;

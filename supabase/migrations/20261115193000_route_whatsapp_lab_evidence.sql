-- Route only the fifteen verified lab evidence items, never infer assay values.
-- Source evidence, attachments and canonical production figures remain unchanged.
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.motil_whatsapp_module_updates_v1
 WHERE id IN ('513fac79-6bb6-4488-9a3f-690cb39a2a2e','9037bd08-faf7-4417-bfaf-7d213c14be38','e666b4a7-1ac1-4437-ab24-ea397fea8586','1d4c8914-9e84-4e5d-9dc8-a27d5aedf047','016a68fe-cd81-434b-ac3a-fe1a99c44a71','65d882d4-88bf-4a4f-bf47-68818a10941e','689b771a-649c-4b35-ac44-63527dfae9e8','b495fda6-9258-401b-8aa1-e076fb45545c','2afa1d36-6ff9-48a4-9099-115baf2009c9','2685f4f8-979d-43e4-a930-3df4066bd811','2ef1987a-daea-420c-b267-cd1a246459c7','a0becd3a-27c0-4b7a-8abc-4d41e97e14b0','cf8ca544-43bc-4b4b-aea4-25ca87c2e262','db159d60-d74c-4ea6-973e-8b937bbb3ae7','e5390820-69db-47ba-bb69-9670bce6edc2') AND activity_kind='documento_laboratorio'
 AND destination_module IN ('planta','laboratorio')
 AND whatsapp_group IN ('Grupo 2','Planta Patagua');
 IF n<>15 THEN RAISE EXCEPTION 'Expected 15 verified laboratory items; got %',n; END IF;
 UPDATE public.motil_whatsapp_module_updates_v1 SET destination_module='laboratorio'
 WHERE id IN ('513fac79-6bb6-4488-9a3f-690cb39a2a2e','9037bd08-faf7-4417-bfaf-7d213c14be38','e666b4a7-1ac1-4437-ab24-ea397fea8586','1d4c8914-9e84-4e5d-9dc8-a27d5aedf047','016a68fe-cd81-434b-ac3a-fe1a99c44a71','65d882d4-88bf-4a4f-bf47-68818a10941e','689b771a-649c-4b35-ac44-63527dfae9e8','b495fda6-9258-401b-8aa1-e076fb45545c','2afa1d36-6ff9-48a4-9099-115baf2009c9','2685f4f8-979d-43e4-a930-3df4066bd811','2ef1987a-daea-420c-b267-cd1a246459c7','a0becd3a-27c0-4b7a-8abc-4d41e97e14b0','cf8ca544-43bc-4b4b-aea4-25ca87c2e262','db159d60-d74c-4ea6-973e-8b937bbb3ae7','e5390820-69db-47ba-bb69-9670bce6edc2') AND destination_module='planta'
 AND activity_kind='documento_laboratorio'
 AND whatsapp_group IN ('Grupo 2','Planta Patagua');
END $$;

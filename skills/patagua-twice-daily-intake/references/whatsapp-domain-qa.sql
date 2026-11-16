-- Read-only verification after targeted routing migrations.
SELECT destination_module,activity_kind,count(*) AS source_items,count(*) FILTER (WHERE canonical_asset_id IS NULL) AS without_asset FROM public.motil_whatsapp_module_feed_v2 GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) AS unresolved_routing FROM public.motil_whatsapp_module_feed_v2 WHERE destination_module='sin_clasificar';
SELECT count(*) AS lab_source_documents FROM public.motil_whatsapp_module_feed_v2 WHERE destination_module='laboratorio' AND activity_kind='documento_laboratorio';
SELECT count(*) AS invalid_activity FROM public.motil_whatsapp_module_feed_v2 WHERE eligible_for_activity_count AND feed_role IN ('source_summary','planned_or_requested','unverified_source_document','supporting_evidence','operational_report');
SELECT message_id,operation_date,destination_module,activity_kind,feed_role,eligible_for_activity_count FROM public.motil_whatsapp_module_feed_v2 WHERE message_id IN (5357,297,298,569,78,6734) ORDER BY message_id,item_index;

-- These immutable SQL helpers use only PostgreSQL built-ins. Pin name
-- resolution to pg_catalog so caller-controlled search_path cannot alter it.
alter function public.motil_media_visual_group(text, text, text)
  set search_path = pg_catalog;

alter function public.planning_normalize_asset_name(text)
  set search_path = pg_catalog;

-- Read-only, organization-scoped weather for the dashboard server.
begin;
create function public.motil_weather_summary_v1(p_organization_id uuid)
returns table(site_id uuid, site_name text, observed_at timestamptz, temperature_c double precision, precipitation_mm double precision, humidity_pct double precision, wind_speed_kmh double precision, wind_gust_kmh double precision, visibility_km jsonb)
language sql stable security definer set search_path = ''
as $$
 select s.id,s.name,o.observed_at,o.temperature_c,o.precipitation_mm,o.humidity_pct,o.wind_speed_kmh,o.wind_gust_kmh,o.metadata->'visibility_km'
 from climate_lab.sites s
 left join lateral (
   select w.* from climate_lab.observations w
   where w.organization_id=s.organization_id and w.site_id=s.id
     and w.source_provider='weatherapi' and w.source_type='observed'
     and w.quality_status in ('pending','verified') and w.observed_at<=now()+interval '5 minutes'
   order by w.observed_at desc,w.ingested_at desc limit 1
 ) o on true
 where s.organization_id=p_organization_id and s.active and s.coordinates_verified
 order by s.name limit 20
$$;
revoke all on function public.motil_weather_summary_v1(uuid) from public, anon, authenticated;
grant execute on function public.motil_weather_summary_v1(uuid) to service_role;
commit;

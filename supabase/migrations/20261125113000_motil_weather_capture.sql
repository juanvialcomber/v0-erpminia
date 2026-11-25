-- Private climate ingestion boundary. No browser access.
begin;
create function public.motil_weather_sites_v1()
returns table(site_id uuid, latitude double precision, longitude double precision)
language sql stable security definer set search_path = ''
as $$
 select s.id,s.latitude,s.longitude from climate_lab.sites s
 where s.active and s.coordinates_verified
 and s.latitude between -90 and 90 and s.longitude between -180 and 180
 order by s.id limit 20
$$;
revoke all on function public.motil_weather_sites_v1() from public, anon, authenticated;
grant execute on function public.motil_weather_sites_v1() to service_role;

create function public.motil_weather_insert_v1(p_site_id uuid,p_observed_at timestamptz,p_temperature_c double precision,p_precipitation_mm double precision,p_humidity_pct double precision,p_wind_speed_kmh double precision,p_wind_gust_kmh double precision,p_metadata jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 if p_observed_at is null or p_observed_at > now() + interval '5 minutes' or p_observed_at < now() - interval '3 hours' then
  raise exception 'Observation timestamp outside capture window';
 end if;
 if p_temperature_c is null or p_temperature_c not between -90 and 65
 or p_precipitation_mm is null or p_precipitation_mm not between 0 and 500
 or p_humidity_pct is null or p_humidity_pct not between 0 and 100
 or p_wind_speed_kmh is null or p_wind_speed_kmh not between 0 and 400
 or p_wind_gust_kmh is null or p_wind_gust_kmh not between 0 and 500 then
  raise exception 'Invalid observation';
 end if;
 insert into climate_lab.observations(organization_id,site_id,observed_at,temperature_c,precipitation_mm,humidity_pct,wind_speed_kmh,wind_gust_kmh,source_provider,source_reference,source_type,quality_status,metadata)
 select s.organization_id,s.id,p_observed_at,p_temperature_c,p_precipitation_mm,p_humidity_pct,p_wind_speed_kmh,p_wind_gust_kmh,'weatherapi','current.json','observed','pending',coalesce(p_metadata,'{}'::jsonb)
 from climate_lab.sites s where s.id=p_site_id and s.active and s.coordinates_verified
 on conflict (organization_id,site_id,observed_at,source_provider,source_type,source_reference) do nothing;
 get diagnostics n = row_count;
 return n = 1;
end;
$$;
revoke all on function public.motil_weather_insert_v1(uuid,timestamptz,double precision,double precision,double precision,double precision,double precision,jsonb) from public, anon, authenticated;
grant execute on function public.motil_weather_insert_v1(uuid,timestamptz,double precision,double precision,double precision,double precision,double precision,jsonb) to service_role;
commit;

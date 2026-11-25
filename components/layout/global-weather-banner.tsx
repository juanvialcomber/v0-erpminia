'use client';

import useSWR from 'swr';
import { CloudSun, ChevronDown } from 'lucide-react';
import { useState } from 'react';

type Site = {
  site_id: string;
  site_name: string;
  observed_at: string | null;
  temperature_c: number | null;
  precipitation_mm: number | null;
  humidity_pct: number | null;
  wind_speed_kmh: number | null;
  wind_gust_kmh: number | null;
  visibility_km: number | null;
};

async function fetchWeather(url: string): Promise<{sites: Site[]} | null> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Weather unavailable');
  return response.json();
}

const format = (value: number | null, unit: string) => value != null && Number.isFinite(value)
  ? value.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' ' + unit : '—';

export function GlobalWeatherBanner({ locale, userId }: { locale: string; userId: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const english = locale === 'en';
  const { data, error, isLoading } = useSWR(userId ? ['/api/weather/summary', userId] : null,
    ([url]) => fetchWeather(url), { revalidateOnFocus: false, refreshInterval: 600000, shouldRetryOnError: false });
  if (!userId || isLoading || (!data && !error) || (data && !data.sites.length)) return null;
  const sites = data?.sites ?? [];
  const hasReadings = sites.some(site => site.observed_at != null);
  const canExpand = hasReadings && !error;
  const recent = (site: Site) => site.observed_at != null && Date.now() - Date.parse(site.observed_at) <= 3 * 3600000;
  const time = (value: string) => new Intl.DateTimeFormat(english ? 'en-CL' : 'es-CL', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago',
  }).format(new Date(value));
  return (
    <section aria-label={english ? 'Operational weather' : 'Clima operacional'} className="border-b border-border bg-card px-4 py-2 md:px-6">
      <button type="button" aria-expanded={canExpand && expanded} aria-disabled={!canExpand} onClick={() => { if (canExpand) setExpanded(v => !v); }}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex shrink-0 items-center gap-2 font-medium"><CloudSun className="size-4 text-muted-foreground" />{english ? 'Weather' : 'Clima'}</span>
        {error ? <span className="text-muted-foreground">{english ? 'Unavailable' : 'No disponible'}</span> : !hasReadings ? <span className="text-muted-foreground">{english ? 'No weather readings yet' : 'Sin lecturas meteorológicas todavía'}</span> : sites.map(site => (
          <span key={site.site_id} className="flex flex-wrap items-center gap-x-2"><span className="text-muted-foreground">{site.site_name}</span>
            <span className="font-medium tabular-nums">{format(site.temperature_c, '°C')}</span>
            <span className="text-muted-foreground">{!site.observed_at ? (english ? 'No readings' : 'Sin datos') : !recent(site) ? (english ? 'Outdated' : 'Desactualizado') : ''}</span></span>
        ))}
        {canExpand ? <ChevronDown className={'ml-auto size-4 shrink-0 transition-transform ' + (expanded ? 'rotate-180' : '')} /> : null}
      </button>
      {canExpand && expanded && <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 xl:grid-cols-3">
        {error ? <p className="text-xs text-muted-foreground">{english ? 'Weather readings could not be refreshed.' : 'No fue posible actualizar las condiciones meteorológicas.'}</p> : sites.map(site => (
          <article key={site.site_id} className="min-w-0 text-xs">
            <h3 className="font-medium">{site.site_name}</h3>
            <p className="mt-1 text-muted-foreground">{site.observed_at ? time(site.observed_at) : (english ? 'No readings yet' : 'Sin registros todavía')}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {[[english ? 'Wind' : 'Viento', format(site.wind_speed_kmh, 'km/h')], [english ? 'Gusts' : 'Ráfagas', format(site.wind_gust_kmh, 'km/h')], [english ? 'Precipitation' : 'Precipitación', format(site.precipitation_mm, 'mm')], [english ? 'Humidity' : 'Humedad', format(site.humidity_pct, '%')], [english ? 'Visibility' : 'Visibilidad', format(site.visibility_km, 'km')]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{value}</dd></div>)}
            </dl>
          </article>
        ))}
        <p className="text-[11px] text-muted-foreground sm:col-span-2 xl:col-span-3">WeatherAPI · {english ? 'Provider conditions, not on-site sensor measurements.' : 'Condiciones del proveedor, no mediciones de sensores en terreno.'}</p>
      </div>}
    </section>
  );
}

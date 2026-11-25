import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const siteSchema = z.object({
  site_id: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const currentSchema = z.object({
  last_updated_epoch: z.number().int().positive(),
  temp_c: z.number().min(-90).max(65),
  precip_mm: z.number().min(0).max(500),
  humidity: z.number().min(0).max(100),
  wind_kph: z.number().min(0).max(400),
  gust_kph: z.number().min(0).max(500),
  vis_km: z.number().min(0).optional(),
  condition: z.object({ code: z.number().int(), text: z.string() }).optional(),
});
const providerSchema = z.object({ current: currentSchema });

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const key = process.env.WEATHER_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const role = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !url || !role) {
    return NextResponse.json({ error: 'Weather capture not configured' }, { status: 503 });
  }
  try {
    const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc('motil_weather_sites_v1');
    if (error) throw new Error('site_lookup_failed');
    const sites = z.array(siteSchema).max(20).parse(data);
    if (!sites.length) return NextResponse.json({ error: 'No verified active sites' }, { status: 503 });
    // Bound parallelism and request time. No credentials in logs or responses.
    const results: Array<{site_id: string; status: string}> = [];
    for (let i = 0; i < sites.length; i += 5) {
      const batch = await Promise.all(sites.slice(i, i + 5).map(async site => {
        try {
          const endpoint = new URL('https://api.weatherapi.com/v1/current.json');
          endpoint.searchParams.set('key', key);
          endpoint.searchParams.set('q', site.latitude + ',' + site.longitude);
          endpoint.searchParams.set('aqi', 'no');
          const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(8000), redirect: 'error' });
          if (!response.ok) return { site_id: site.site_id, status: 'provider_failed' };
          const { current } = providerSchema.parse(await response.json());
          const observedAt = new Date(current.last_updated_epoch * 1000);
          const age = Date.now() - observedAt.getTime();
          if (age > 3 * 3600000 || age < -300000) return { site_id: site.site_id, status: 'stale_or_future' };
          const { data: inserted, error: writeError } = await db.rpc('motil_weather_insert_v1', {
            p_site_id: site.site_id,
            p_observed_at: observedAt.toISOString(),
            p_temperature_c: current.temp_c,
            p_precipitation_mm: current.precip_mm,
            p_humidity_pct: current.humidity,
            p_wind_speed_kmh: current.wind_kph,
            p_wind_gust_kmh: current.gust_kph,
            p_metadata: {
              visibility_km: current.vis_km ?? null,
              condition: current.condition ?? null,
              retrieved_at: new Date().toISOString(),
              provider_kind: 'provider_current_conditions',
            },
          });
          if (writeError || typeof inserted !== 'boolean') return { site_id: site.site_id, status: 'write_failed' };
          return { site_id: site.site_id, status: inserted ? 'inserted' : 'duplicate_or_inactive' };
        } catch {
          return { site_id: site.site_id, status: 'capture_failed' };
        }
      }));
      results.push(...batch);
    }
    const failed = results.filter(item => item.status !== 'inserted' && item.status !== 'duplicate_or_inactive').length;
    return NextResponse.json({ ok: failed === 0, sites: sites.length, inserted: results.filter(item => item.status === 'inserted').length, failed, results }, { status: failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Weather capture failed' }, { status: 503 });
  }
}

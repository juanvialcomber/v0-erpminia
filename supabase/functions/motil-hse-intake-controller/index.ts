// Private HSE intake controller. Deploy with verify_jwt=true.
// Authenticated allowlisted operator only; never expose service role credentials.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const PROJECT = "ttlptyheuqeotadtcbaw";
const BUCKET = "module-documents";
const PREFIX = "prevencion/documentos-hse/";
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || new URL(url).hostname !== PROJECT + ".supabase.co" || !secret) return reply({ error: "configuration" }, 503);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /i, "") || "";
  const allowlist = (Deno.env.get("HSE_INTAKE_OPERATOR_USER_IDS") || "").split(",").map(x => x.trim()).filter(Boolean);
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!bearer || !anon || allowlist.length === 0) return reply({ error: "forbidden" }, 403);
  const identityClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await identityClient.auth.getUser(bearer);
  if (identityError || !identity.user || !allowlist.includes(identity.user.id)) return reply({ error: "forbidden" }, 403);
  const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let input: { offset?: number; limit?: number; inspect?: boolean };
  try { input = await req.json(); } catch { return reply({ error: "invalid_json" }, 400); }
  const offset = Number(input.offset ?? 0);
  const limit = Number(input.limit ?? 10);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20) return reply({ error: "invalid_pagination" }, 400);
  const { data, error } = await supabase.storage.from(BUCKET).list(PREFIX.slice(0, -1), { limit, offset, sortBy: { column: "name", order: "asc" } });
  if (error) return reply({ error: "storage_unavailable" }, 502);
  const files = (data ?? []).filter(f => Boolean(f.id) && Boolean(f.name));
  const results: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const size = Number(file.metadata?.size ?? 0);
    const item: Record<string, unknown> = { storage_id: file.id, extension: file.name?.split(".").pop()?.toLowerCase(), bytes: size };
    if (input.inspect === true) {
      if (size > 12 * 1024 * 1024) { item.status = "too_large"; }
      else {
        const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(PREFIX + file.name);
        if (downloadError || !blob) item.status = "download_error";
        else {
          const buffer = await blob.arrayBuffer();
          if (buffer.byteLength > 12 * 1024 * 1024) item.status = "too_large";
          else {
            const digest = await crypto.subtle.digest("SHA-256", buffer);
            item.sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
            item.status = "verified_bytes";
          }
        }
      }
    }
    results.push(item);
  }
  return reply({ scope: "motil_hse", offset, limit, returned: results.length, has_more: files.length === limit, items: results, mutates_data: false });
});

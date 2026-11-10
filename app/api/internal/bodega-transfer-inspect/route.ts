import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

import { mapSheet } from "../../../../scripts/extract-bodega-transfers.mjs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_SKUS = ["CORREA0113", "FERRETERÍA0111", "FERRETERIA0111"]

function normalizeSku(value: unknown) {
  return String(value ?? "").trim().toUpperCase()
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "preview_only" }, { status: 404 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "missing_server_env" }, { status: 500 })
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 10)
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 25) : 10
  const skus = (request.nextUrl.searchParams.getAll("sku").length
    ? request.nextUrl.searchParams.getAll("sku")
    : DEFAULT_SKUS
  ).map(normalizeSku)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: items, error: intakeError } = await supabase
    .from("document_intake_items")
    .select("id, original_name, storage_bucket, storage_path, source_path, status")
    .eq("status", "pending_classification")
    .ilike("source_path", "%Traslados de Stgo%")
    .order("original_name", { ascending: false })
    .limit(limit)

  if (intakeError) {
    return NextResponse.json({ error: "intake_query_failed", detail: intakeError.message }, { status: 500 })
  }

  const files = []
  for (const item of items ?? []) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(item.storage_bucket)
      .download(item.storage_path)

    if (downloadError || !blob) {
      files.push({
        id: item.id,
        name: item.original_name,
        status: "download_error",
        detail: downloadError?.message ?? "missing_blob",
      })
      continue
    }

    try {
      const bytes = Buffer.from(await blob.arrayBuffer())
      const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true })
      const candidates = workbook.SheetNames.flatMap((sheetName) =>
        mapSheet(sheetName, workbook.Sheets[sheetName], item.original_name).rows,
      )
      const matches = candidates.filter((row) => skus.includes(normalizeSku(row.sku)))

      files.push({
        id: item.id,
        name: item.original_name,
        sourcePath: item.source_path,
        status: "parsed",
        candidateRows: candidates.length,
        matchedRows: matches.length,
        matches: matches.map((row) => ({
          sourceSheet: row.sourceSheet,
          sourceRow: row.sourceRow,
          sku: row.sku,
          description: row.description,
          quantity: row.quantity,
          origin: row.origin,
          destination: row.destination,
          responsible: row.responsible,
          date: row.date,
          reference: row.reference,
        })),
      })
    } catch (error) {
      files.push({
        id: item.id,
        name: item.original_name,
        status: "parse_error",
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return NextResponse.json({
    mode: "dry-run",
    readOnly: true,
    scannedFiles: items?.length ?? 0,
    requestedSkus: skus,
    files,
  })
}

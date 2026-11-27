#!/usr/bin/env node

import process from "node:process"
import pg from "pg"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

import { mapSheet } from "./extract-bodega-transfers.mjs"

const { Client } = pg

function parseArgs(argv) {
  const args = { limit: 10, skus: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--limit") args.limit = Number(argv[++i])
    else if (arg === "--sku") args.skus.push(String(argv[++i]).toUpperCase())
    else throw new Error(`Argumento desconocido: ${arg}`)
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
    throw new Error("--limit debe estar entre 1 y 50")
  }
  return args
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Falta ${name}`)
  return value
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
  if (!databaseUrl) throw new Error("Falta POSTGRES_URL_NON_POOLING o POSTGRES_URL")

  const supabaseUrl = requireEnv("SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const db = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
  const storage = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  await db.connect()
  try {
    const result = await db.query(
      `select id, original_name, storage_bucket, storage_path, source_path
       from public.document_intake_items
       where status = 'pending_classification'
         and source_path ilike '%Traslados de Stgo%'
       order by original_name desc
       limit $1`,
      [args.limit],
    )

    const files = []
    for (const item of result.rows) {
      const { data, error } = await storage.storage.from(item.storage_bucket).download(item.storage_path)
      if (error) {
        files.push({
          id: item.id,
          name: item.original_name,
          status: "download_error",
          error: error.message,
        })
        continue
      }

      const bytes = Buffer.from(await data.arrayBuffer())
      const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true })
      const candidates = workbook.SheetNames.flatMap((sheetName) =>
        mapSheet(sheetName, workbook.Sheets[sheetName], item.original_name).rows,
      )

      const filtered = args.skus.length
        ? candidates.filter((row) => args.skus.includes(String(row.sku || "").toUpperCase()))
        : candidates

      files.push({
        id: item.id,
        name: item.original_name,
        sourcePath: item.source_path,
        status: "parsed",
        sheets: workbook.SheetNames,
        candidateRows: candidates.length,
        matchedRows: filtered.length,
        matches: filtered.map((row) => ({
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
    }

    console.log(JSON.stringify({
      mode: "dry-run",
      readOnly: true,
      scannedFiles: result.rows.length,
      requestedSkus: args.skus,
      files,
    }, null, 2))
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

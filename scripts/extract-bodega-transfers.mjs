#!/usr/bin/env node

import { readFile } from "node:fs/promises"
import process from "node:process"
import * as XLSX from "xlsx"

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim().replace(/\s+/g, " ")
  return text.length ? text : null
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "")
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const HEADER_ALIASES = {
  sku: ["codigo", "cod producto", "codigo producto", "sku", "item", "cod"],
  description: ["producto", "descripcion", "detalle", "material", "articulo", "repuesto"],
  quantity: ["cantidad", "cant", "qty", "unidades", "cantidad enviada", "cantidad traslado"],
  origin: ["origen", "desde", "bodega origen", "sale de", "despacho"],
  destination: ["destino", "hacia", "bodega destino", "entrega", "recepcion"],
  responsible: ["responsable", "retira", "recibe", "solicitante", "chofer", "persona"],
  date: ["fecha", "fecha traslado", "fecha despacho"],
  reference: ["referencia", "folio", "n solicitud", "solicitud", "numero", "nro"],
}

function findColumn(headers, aliases) {
  const normalized = headers.map(normalizeHeader)
  for (let index = 0; index < normalized.length; index += 1) {
    if (aliases.some((alias) => normalized[index] === alias || normalized[index].includes(alias))) {
      return index
    }
  }
  return -1
}

function detectHeaderRow(matrix) {
  const maxScan = Math.min(matrix.length, 30)
  let best = null
  for (let rowIndex = 0; rowIndex < maxScan; rowIndex += 1) {
    const row = matrix[rowIndex] || []
    const headers = row.map(normalizeHeader)
    const score = Object.values(HEADER_ALIASES).reduce((sum, aliases) => {
      return sum + (headers.some((header) => aliases.some((alias) => header === alias || header.includes(alias))) ? 1 : 0)
    }, 0)
    if (!best || score > best.score) best = { rowIndex, score, raw: row }
  }
  return best && best.score >= 2 ? best : null
}

function inferDestinationFromFilename(fileName) {
  const text = normalizeHeader(fileName)
  const candidates = [
    ["jdm", "Mina Don Jaime"],
    ["don jaime", "Mina Don Jaime"],
    ["peumo", "Mina Peumo"],
    ["san pedro", "Mina San Pedro"],
    ["planta", "Planta"],
    ["raiz", "Mina Raiz del Cobre"],
  ]
  for (const [needle, value] of candidates) {
    if (text.includes(needle)) return value
  }
  return null
}

function mapSheet(sheetName, worksheet, fileName) {
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true })
  const header = detectHeaderRow(matrix)
  if (!header) return { sheetName, rows: [], warnings: ["header_not_detected"] }

  const headers = header.raw
  const columns = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, findColumn(headers, aliases)]),
  )

  const rows = []
  for (let rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || []
    const sku = columns.sku >= 0 ? normalizeText(row[columns.sku]) : null
    const description = columns.description >= 0 ? normalizeText(row[columns.description]) : null
    const quantity = columns.quantity >= 0 ? normalizeNumber(row[columns.quantity]) : null

    if (!sku && !description && quantity === null) continue
    if (quantity === null || quantity === 0) continue

    rows.push({
      sourceSheet: sheetName,
      sourceRow: rowIndex + 1,
      sku,
      description,
      quantity,
      origin: columns.origin >= 0 ? normalizeText(row[columns.origin]) : "Bodega Santiago",
      destination:
        (columns.destination >= 0 ? normalizeText(row[columns.destination]) : null) ??
        inferDestinationFromFilename(fileName),
      responsible: columns.responsible >= 0 ? normalizeText(row[columns.responsible]) : null,
      date: columns.date >= 0 ? normalizeText(row[columns.date]) : null,
      reference: columns.reference >= 0 ? normalizeText(row[columns.reference]) : null,
      raw: row,
    })
  }

  return { sheetName, rows, warnings: [] }
}

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error("Uso: node scripts/extract-bodega-transfers.mjs <archivo.xlsx>")

  const bytes = await readFile(file)
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true })
  const fileName = file.split(/[\\/]/).pop()
  const sheets = workbook.SheetNames.map((sheetName) =>
    mapSheet(sheetName, workbook.Sheets[sheetName], fileName),
  )
  const candidates = sheets.flatMap((sheet) => sheet.rows)
  const warnings = sheets.flatMap((sheet) => sheet.warnings.map((warning) => ({ sheet: sheet.sheetName, warning })))

  const usable = candidates.filter((row) => row.quantity !== null && (row.sku || row.description))
  const deterministic = usable.filter((row) => row.sku && row.origin && row.destination)

  console.log(JSON.stringify({
    mode: "dry-run",
    file: fileName,
    sheets: workbook.SheetNames.length,
    candidateRows: usable.length,
    deterministicRows: deterministic.length,
    warnings,
    candidates: usable,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

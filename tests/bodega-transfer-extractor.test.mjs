import test from "node:test"
import assert from "node:assert/strict"
import * as XLSX from "xlsx"

import {
  detectHeaderRow,
  inferDestinationFromFilename,
  mapSheet,
  normalizeHeader,
} from "../scripts/extract-bodega-transfers.mjs"

test("normalizes transfer headers", () => {
  assert.equal(normalizeHeader("Bodega Destino"), "bodega destino")
  assert.equal(normalizeHeader("CÓDIGO"), "codigo")
})

test("detects a transfer header row", () => {
  const matrix = [
    ["TRASLADO DE BODEGA"],
    [null],
    ["Código", "Descripción", "Cantidad", "Destino"],
    ["CORREA0113", "Correa Alternador 8PK-2170", 1, "Mina Peumo"],
  ]
  const header = detectHeaderRow(matrix)
  assert.equal(header?.rowIndex, 2)
  assert.ok((header?.score ?? 0) >= 4)
})

test("infers mine destination from filename", () => {
  assert.equal(inferDestinationFromFilename("02-10-23 JDM.xlsx"), "Mina Don Jaime")
  assert.equal(inferDestinationFromFilename("traslado Peumo.xlsx"), "Mina Peumo")
  assert.equal(inferDestinationFromFilename("archivo.xlsx"), null)
})

test("maps deterministic candidate rows without writing stock", () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Traslado"],
    ["Código", "Descripción", "Cantidad", "Destino", "Responsable"],
    ["FERRETERÍA0111", "Silicona Spray Tablero 400ml", 2, "Mina Don Jaime", "William Videla"],
  ])

  const result = mapSheet("Hoja1", worksheet, "23-12-24 Pedro Zegers - i29707.xlsx")
  assert.equal(result.rows.length, 1)
  assert.deepEqual(
    {
      sku: result.rows[0].sku,
      quantity: result.rows[0].quantity,
      origin: result.rows[0].origin,
      destination: result.rows[0].destination,
      responsible: result.rows[0].responsible,
    },
    {
      sku: "FERRETERÍA0111",
      quantity: 2,
      origin: "Bodega Santiago",
      destination: "Mina Don Jaime",
      responsible: "William Videla",
    },
  )
})

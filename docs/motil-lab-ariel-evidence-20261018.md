# MOTIL LAB: versioned source evidence and workbook intake

## Problem and scope

The maintenance guideline library previously rendered static equipment families and a shared reviewed flag. It could not identify the actual source file, version, reviewer, original binary, or cell behind a value. Existing tabular importers remain operational importers; they are not a full workbook evidence protocol.

This change adds a source catalogue and an explicit native workbook review workflow to Maintenance / Sources and Preventive Planning. It reuses existing private document storage, document version fields, review fields and source imports. It creates no database migration and performs no data backfill. The source branch targets a LAB Preview and does not change production aliases, the scheduled jobs or the WhatsApp integration.

## User workflow

1. Open Maintenance / Sources or the document library in Preventive Planning.
2. Search the loaded source catalogue by file, version or sender and filter by source and recorded review state.
3. Open an available original through an authenticated, short-lived link. Missing originals and unverified provenance have explicit reasons.
4. Choose an XLSX or binary XLS, then **Examinar todas las hojas**. This first action performs no persistence.
5. Inspect every sheet, including hidden sheets, filter formulas and locate an exact cell address. The interface pages the cells; the complete manifest remains available for download.
6. When the server confirms write permission, choose **Guardar original y borrador** to archive the original bytes and the extraction for review. Readers can inspect and download the manifest; they are shown a clear explanation instead of a save action. An explicit predecessor links a new version; an unchanged original does not become another version.

The source sender, person who uploaded the file and recorded reviewer are distinct roles. Extraction is not document approval. Document approval or an asset link alone does not establish the technical applicability of a maintenance guideline.

## API and identities

| Interface | Contract |
| --- | --- |
| `GET /api/maintenance/source-evidence` | Read-only projection of planning imports, private maintenance documents and explicitly authorized WhatsApp attachment sources. Filters: `q`, `sourceType`, `review`. |
| `GET /api/maintenance/source-evidence/[sourceType]/[id]/origin` | Resolves a private original after module and organization checks; JSON for `Accept: application/json`, otherwise a redirect. Signed URLs expire after 120 seconds. |
| `POST /api/maintenance/source-workbooks` multipart | `file`, `action=analyze` or `save-draft`, optional `previousVersionId`. The server always parses the original; it never trusts a client-supplied extraction. |
| `POST /api/maintenance/source-workbooks` JSON | `action=analyze`, `sourceKind=module_document`, `sourceId`. Downloads and reparses an authorized existing original. No client-supplied URL or storage bucket. |

Catalogue identities are `planning_import:<id>`, `module_document:<id>` and `whatsapp_attachment:<id>`. They preserve the independent lifecycles of an import, document and delivery. No filename-based merge creates an original link or an asset match.

The native intake protocol is `motil.workbook-evidence.v1`. The document ID is UUIDv5 over organization, binary SHA-256 and the explicit predecessor. Storage paths contain the same identity and organization. Storage upload uses `upsert: false`; database insertion uses the existing primary key. Retries and concurrent identical uploads can reuse only verified identical bytes and a matching draft. A renamed copy retains the first stored original filename.

Successful responses include `capabilities.canSaveDraft` and an optional explanatory `reason`, computed from both module write access and the same maintenance role predicate used by the write gate. The UI denies saving when this capability is absent or false. This does not replace authorization on each save request or expand the existing permitted roles.

A recoverable database insertion failure after a successful original upload returns an explicit incomplete-save error. The immutable original stays recoverable by retrying the same upload; the handler never deletes a path that a concurrent request may already have referenced. A document that was removed from the catalogue instead returns a deterministic HTTP 409, including conflicts discovered during an identical concurrent save. It is not restored or assigned a different identity, and the error does not advise an impossible retry.

## Evidence fidelity

The manifest records the file hash and byte length, parser/version, date system, all sheets and visibility, native cell addresses, cell types, values, formats, formulas, cached values, merged ranges, row/column metadata, defined names and lexical formula references. Formula results are never recalculated. There is no inference of hours, kilometres, active plans, current readings, stock withdrawals or equipment applicability from a filename.

XLSX XML metadata is used to distinguish a genuinely stored zero from an empty or absent numeric formula cache. The native original remains authoritative for chart objects, macros, external resources, visual layout and features not represented by the extraction library. Lexical formula references do not constitute a resolved calculation graph.

Historic `source_file_sha256` values are displayed as registered hashes without upgrading them to verified binary integrity. Native intake metadata is recognized only when its schema, deterministic document identity, storage path, byte length and supporting-source role match. This prevents arbitrary legacy `extracted_data` JSON from claiming verified native intake.

## Bounded reads and resource controls

- The source catalogue reads at most 200 records per source type in stable date/ID order. It reports unavailable or truncated sources and states that filters apply to that loaded window.
- Catalogue reads select small JSON projections for schema, file, counts and extraction status. They do not fetch all cell manifests or full OCR transcripts.
- The existing `/api/documents/list` endpoint also separates legacy document reads from native workbook projections. Legacy extraction data remains available to current review consumers; native workbooks return an explicit `summaryOnly` outline. The full native manifest and its search text never cross the database boundary in this list. Tenant, module, status, asset, section and deletion filters apply to both query branches; the merged list reports truncation and an exact total, or `null` when no exact count is available.
- Upload requests are bounded before multipart parsing; the file limit is 3 MiB. Existing authorized originals may be read within the parser's separate bound.
- ZIP structure and actual inflated bytes are checked before parsing. Oversized or unsupported files fail explicitly, without silently dropping sheets or cells.
- Large complete manifests are returned with gzip, within a bounded wire response. A response-size or encoding error is detected before a new original or draft is persisted.
- The UI renders 12 source records or 10 cells per page and can export the full manifest.

## Authorization and operational boundaries

All new routes require `MANT_OPERACIONES` and an authenticated organization. Saving also requires write capability and the existing maintenance write-role gate. Original lookup, version lookup and duplicate reuse are scoped to that organization. Deleted documents are excluded from the catalogue and original access; the save path checks their retained identity to report a conflict. Historical versions stay distinct. The existing `super_admin` role discrepancy is not used to grant new maintenance write access: both the advertised capability and write gate preserve the existing denial.

WhatsApp access requires an explicit server-side `MAINTENANCE_SOURCE_GROUP_IDS` allowlist as well as current organization membership, enabled group state and the existing archived-source exclusion. An unset allowlist contributes no WhatsApp records. Group display names never grant access. This release does not set that environment variable, reopen archived chats, sync history or change the integration.

There are no changes to canonical assets, readings, maintenance plans, work orders, job plan applicability, material consumption, warehouse balances or scheduled tasks. Those actions retain their existing review workflows.

## Research basis

The implementation applies the structural provenance and explicit evidence patterns discussed in [Docling](https://arxiv.org/abs/2501.17887), the need to preserve native spreadsheet structure alongside retrieval representations in [SpreadsheetLLM](https://arxiv.org/abs/2407.09025), and schema-driven extraction with independent completeness checks in [Schema-Driven Information Extraction from Heterogeneous Tables](https://arxiv.org/abs/2305.14336). These papers informed the design; their extraction models were not deployed or benchmarked as part of this change.

The first release uses exact text filters and native evidence. It does not add a vector database, generated-summary hierarchy or knowledge graph.

## Validation record

The initial implementation's complete repository gate passed on 2026-10-18: 1,776 tests passed with zero failures or skips; all 297 migration versions were unique; the repository ESLint and TypeScript checks passed; and the optimized Next.js build completed with 301 static pages plus the dynamic evidence endpoints. The repository secret guard also passed. That implementation added 52 focused regression cases across source projection, native workbook intake, UI state and document-list compatibility.

The follow-up save checks cover reader/editor capabilities using the real organization gate with controlled authentication/database doubles, permitted roles, the existing `super_admin` denial, missing capabilities in the UI, and retained deleted identities before upload and during concurrent-save recovery. The current commit's complete build and hosted verification are recorded in the PR release review.

Independent verification against the XML in two authentic workbooks compared 95,869 cells across 14 sheets. It found zero discrepancies in the audited fields: cell addresses, XML types/styles/values/formulas and attributes, literal and cached scalar presence, custom number formats, sheet visibility, merged ranges and defined names. One workbook's 10,337 formulas have no numeric cache; the other has 10,345 cached formulas, including 5,348 explicit empty strings. The parser preserves these distinctions without recalculation.

Real Chromium interaction with the actual components, styles and native parser passed at desktop (1440 × 1000) and mobile (390 × 844) sizes. Checks covered catalogue filtering, all-sheet inspection, formula lookup, gzip response handling and explicit save behavior, with zero page errors or horizontal overflow. The desktop download contained the complete manifest. Persistence was simulated in this browser harness; it made no Supabase writes.

Test fixtures remain synthetic; authentic private workbooks are used only in local and authorized LAB verification and are not committed to this public repository. The initial verification did not include an authenticated user's real save to shared storage/database. Any subsequent authenticated save, original verification and idempotency results are recorded with their exact deployment identity in the release review.

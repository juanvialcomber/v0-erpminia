# Canonical document intake — server-side execution

Reusable ingestion convention for N3uralia products. Source originals and derived text remain tenant-isolated.

The reusable ChatGPT skill is `canonical-document-intake`. Do not upload HSE originals or extracted text to this public GitHub repository.

## Current MOTIL baseline
- Project `ttlptyheuqeotadtcbaw`, private Storage bucket `module-documents`
- HSE prefix `prevencion/documentos-hse/`
- 84 registered HSE objects
- 5 spreadsheet document records currently report `Invalid schema: canonical` and zero promoted rows
- Extraction is not canonical approval

## Gate
1. In a private server environment, download the files through authenticated Storage REST.
2. Record cryptographic checksum, object identity, version, and source locator.
3. Extract PDF/DOC/XLS/XLSX; log OCR and encrypted/unsupported exceptions.
4. Compare 84 expected against downloaded and genuinely extracted, not just database rows.
5. Quarantine sensitive medical/identity/contract files from generic semantic indexes.
6. Repair the real importer's wrong `canonical` schema reference only after checking its privileges and actual API exposure. Do not invent a `canonical` schema or enable private schema exposure in PostgREST.
7. Promote versioned facts only after an authorized HSE reviewer signs off on applicability, authority and effective date.

The existing `scripts/canonical-hse-intake.mjs` in PR #482 is read-only. It requires a trusted server runtime with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; no endpoint should expose these credentials to the browser.

No complete HSE import, OCR remediation, or release is implied by this document.

# Engineering and Projects — integration gates and applied research (2026-11-16)

## Decision
Keep operational approvals deterministic and human-signed. Do not use an LLM as an approver. Use source-grounded retrieval for project records and the MOP Manual de Carreteras.

## Evidence from arXiv
- EvidenT, https://arxiv.org/abs/2609.22537: enterprise assistants can suffer citation drift; verify source spans before responding. Applicability: cite document edition, volume, section, page, and source record. This is a design principle, not proof of local quality.
- RAGChecker, https://arxiv.org/abs/2408.08067: retrieval and generation require separate diagnostic measures. Applicability: test whether the right source was retrieved separately from whether the answer is supported.
- W-RAG, https://arxiv.org/abs/2608.22081: heterogeneous sources require source-aware retrieval. Applicability: keep MOP normative documents distinct from internal project records and budgets.

## Operational gates
1. Verify actual Supabase project from deployed MOTIL environment (not a similarly named project). Read-only schema check before migration.
2. Inventory canonical engineering project and request tables. Reuse existing authoritative entities; if absent, add migration with tenant RLS, immutable approvals and audit events.
3. Cristian alone classifies requests as normal, alta, urgente or critica, with actor, time and reason. Urgente/critica mark a program change. Any program change requires supervisor then CEO; unchanged program requires supervisor only. CEO has read access to all but no approval action for unchanged requests.
4. Build authenticated request CRUD, classification, signed transitions and calendar views. Enforce authorization server-side, not merely by hiding buttons.
5. Link project budget versions, committed costs, accounting actuals, invoices, payments and verified physical progress without conflating them.
6. Add source-specific assistant retrieval; MOP Manual de Carreteras official source https://mc.mop.gob.cl. Do not claim ingestion until volume/edition/page indexing and citation tests pass.
7. Run tenant/RBAC, duplicate-signature, concurrency, invalid transition, empty/error, local typecheck/build and exact-SHA preview QA. No merge before these gates.

## Current verified status
The engineering discovery API is a read-only placeholder; its response explicitly marks portfolio intake, requests workflow, budgets and physical progress unavailable. The assistant reads mining planning, topography gaps and actionable tasks, not canonical engineering projects or budgets. This document is a plan and evidence ledger, not a declaration of operational integration.

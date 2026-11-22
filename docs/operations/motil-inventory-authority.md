# MOTIL Operational Inventory Authority

**Status:** MOTIL-native count capture and second-person review are implemented in the current change; posting an approved opening balance to operational stock remains pending.

## Decision

MOTIL is the operational system of record for warehouse balances, stock movements, maintenance material requirements, and the operational cost trace that follows those movements. Laudus remains an external evidence and accounting reference during reconciliation. Laudus quantities must not be copied into an available MOTIL balance automatically.

## Canonical data contract

- A balance is scoped to organization, warehouse, canonical product, and unit of measure. Location/bin may be recorded when known.
- A physical count is recorded from the MOTIL catalog independently of Laudus, including when Laudus has no matching quantity or its value is stale or disputed.
- The first pilot is scoped to Central (002) and requires an active, assigned counter; a different assigned verifier must review the result.
- Count evidence and reviews are immutable. Approval means ready for opening-balance posting; it does not make stock available until the operational ledger supports the confirmed unit precision.
- The counted quantity is evidence first. An authorized warehouse verifier confirms product identity, unit, warehouse, quantity, and evidence before MOTIL accepts it as an opening balance.
- Each accepted opening balance and subsequent receipt, issue, return, transfer, or adjustment is an attributable, idempotent movement. Current stock is derived from those movements and the accepted opening balance.
- Laudus observations remain separate, timestamped comparison evidence. They never overwrite a MOTIL balance.
- Legacy rows without a validated warehouse assignment remain historical/unassigned. They are excluded from available-to-reserve stock until explicitly reconciled.
- Unknown, uncounted, ambiguous-identity, stale, or unit-conflicted quantities remain visibly unverified. They are never silently treated as zero or as available stock.
- The transition must not block the existing mechanic work-order completion flow.

## Maintenance and warehouse flow

1. Bodega selects an active, validated MOTIL product and records the observed quantity, unit, and optional evidence in Central (002).
2. MOTIL stores the count as immutable evidence, independent of Laudus.
3. A second assigned verifier approves the count for opening or requests a recount; neither action changes available stock.
4. After quantity precision and movement-ledger changes are validated, the approved count can be posted idempotently as a MOTIL opening balance.
5. Maintenance then uses verified MOTIL balances for material requirements, reservations, issues, delivery, installation, and return.
6. Purchases and receipts enter MOTIL operational history. Any Laudus reference is reconciled separately and cannot replace the MOTIL movement record.
7. LECV reports product maturity, adoption, reconciliation coverage, and measured outcomes; unproven savings remain unclaimed.

## Ownership

- Project lead on the customer side coordinates area decisions and acceptance.
- Warehouse lead owns physical counts, identity/unit confirmation, and warehouse evidence.
- N3uralia engineering translates approved workflows into data models, controls, integrations, and product changes.
- Area supervisors retain authority over work-order and material decisions.

## Rollout and release gates

1. MOTIL-native count capture and second-person review are in place for Central (002); records are append-only and independent of Laudus.
2. Adapt stock and movement quantity precision, then implement idempotent posting of an approved count as a MOTIL opening balance.
3. Pilot the opening balance in Central (002) without bulk-promoting Laudus or unassigned legacy rows.
4. Connect verified MOTIL balances to reservation, issue, return, and work-order cost paths.
5. Extend the same controlled model to other warehouses and purchasing/receipt workflows.
6. Verify tenant boundaries, verifier permissions, idempotency, unit precision, movement auditability, and preservation of the existing work-order close flow before production release.

The count-and-review workflow does not change production balances. The opening-balance posting remains blocked until the integer-only stock and movement ledger is adapted and its work-order reservation paths are verified. The implementation must not bulk-canonicalize Laudus quantities or unassigned legacy rows.

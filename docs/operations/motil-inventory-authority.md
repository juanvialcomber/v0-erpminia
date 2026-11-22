# MOTIL Operational Inventory Authority

**Status:** approved product direction; implementation pending.

## Decision

MOTIL is the operational system of record for warehouse balances, stock movements, maintenance material requirements, and the operational cost trace that follows those movements. Laudus remains an external evidence and accounting reference during reconciliation. Laudus quantities must not be copied into an available MOTIL balance automatically.

## Canonical data contract

- A balance is scoped to organization, warehouse, canonical product, and unit of measure. Location/bin may be recorded when known.
- A physical count can be recorded even when Laudus has no matching quantity or its value is stale or disputed.
- The counted quantity is evidence first. An authorized warehouse verifier confirms product identity, unit, warehouse, quantity, and evidence before MOTIL accepts it as an opening balance.
- Each accepted opening balance and subsequent receipt, issue, return, transfer, or adjustment is an attributable, idempotent movement. Current stock is derived from those movements and the accepted opening balance.
- Laudus observations remain separate, timestamped comparison evidence. They never overwrite a MOTIL balance.
- Legacy rows without a validated warehouse assignment remain historical/unassigned. They are excluded from available-to-reserve stock until explicitly reconciled.
- Unknown, uncounted, ambiguous-identity, stale, or unit-conflicted quantities remain visibly unverified. They are never silently treated as zero or as available stock.
- The transition must not block the existing mechanic work-order completion flow.

## Maintenance and warehouse flow

1. Bodega records or resolves the product in the MOTIL catalog and captures a physical count.
2. The assigned verifier confirms the count and its evidence; MOTIL records the opening balance.
3. Maintenance links material requirements to a work order.
4. MOTIL reserves and issues only validated MOTIL balances; delivery, installation, and return remain separately traceable.
5. Purchases and receipts enter MOTIL operational history. Any Laudus reference is reconciled separately and cannot replace the MOTIL movement record.
6. LECV reports product maturity, adoption, reconciliation coverage, and measured outcomes; unproven savings remain unclaimed.

## Ownership

- Project lead on the customer side coordinates area decisions and acceptance.
- Warehouse lead owns physical counts, identity/unit confirmation, and warehouse evidence.
- N3uralia engineering translates approved workflows into data models, controls, integrations, and product changes.
- Area supervisors retain authority over work-order and material decisions.

## Rollout and release gates

1. Implement the source-independent count and canonical opening-balance workflow.
2. Pilot it in the designated central warehouse; reconcile legacy records without bulk-promoting source quantities.
3. Connect verified MOTIL balances to reservation, issue, return, and work-order cost paths.
4. Extend the same controlled model to other warehouses and purchasing/receipt workflows.
5. Verify tenant boundaries, verifier permissions, idempotency, unit precision, movement auditability, and preservation of the existing work-order close flow before production release.

No production balances are changed by this design document. The implementation must not bulk-canonicalize Laudus quantities or unassigned legacy rows.

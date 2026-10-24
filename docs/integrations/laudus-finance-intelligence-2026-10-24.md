# Laudus financial intelligence — 2026-10-24

## Problem

Laudus exposes a large historical financial corpus, while MOTIL currently has a much smaller operational payable baseline. Copying ERP history directly into MOTIL payables would destroy the distinction between financial evidence and operational authority.

Observed baseline:
- 12,160 positive Laudus purchase documents.
- 1,183 documents with outstanding balance.
- 1,037 of those are overdue by source due date.
- CLP 1,915,213,299 outstanding in the Laudus source-derived model.
- 4 canonical MOTIL supplier invoices.
- 3 canonical MOTIL payables.
- 1,146 / 1,183 open Laudus documents can identify one unique MOTIL supplier by exact normalized supplier name.
- A stronger RUT-based diagnostic resolves 1,147 / 1,183, but the current low-cost UI read path intentionally does not expose raw tax identifiers.
- Only 3 unique deterministic PO candidates were found with the current canonical PO coverage and conservative amount/date matching. PO auto-linking is therefore not justified yet.

## Research gate

Relevant design evidence:
- Yin et al., "Combining Data-driven Supervision with Human-in-the-loop Feedback for Entity Resolution", arXiv:2111.10497.
- Binette & Steorts, "(Almost) All of Entity Resolution", arXiv:2008.04443.
- Schreyer et al., "Detection of Anomalies in Large Scale Accounting Data using Deep Autoencoder Networks", arXiv:1709.05254.
- Zeng et al., "Similar Data Points Identification with LLM: A Human-in-the-loop Strategy Using Summarization and Hidden State Insights", arXiv:2404.04281.
- Pyo & Chiang, "Leveraging Large Language Models for Generating Labeled Mineral Site Record Linkage Data", arXiv:2412.03575.\n- Wang et al., "Dynamic Anomaly Identification in Accounting Transactions via Multi-Head Self-Attention Networks", arXiv:2511.12122.\n- Na et al., "Human-Centered LLM-Agent System for Detecting Anomalous Digital Asset Transactions", arXiv:2510.20102.\n- Lodhi, "Explainable Artificial Intelligence for Anomaly Detection in Banking Transactions: An Internal Audit Perspective", arXiv:2607.13469.\n- Müller et al., "RESHAPE: Explaining Accounting Anomalies in Financial Statement Audits by enhancing SHapley Additive exPlanations", arXiv:2209.09157.

Design implication for MOTIL:
1. Use deterministic identity rules first where evidence is strong.
2. Rank ambiguous or high-impact cases instead of presenting the full corpus.
3. Keep human review on consequential financial promotion.
4. Capture future approve/reject labels before training or calibrating a learned matcher.
5. Treat anomaly models as prioritizers, not as payment authority.\n6. Prefer explanation + analyst action capture over opaque autonomous decisions; newer financial-agent work reinforces this human-centered pattern.\n7. Present the score as decomposed operational evidence (age, amount, payment state, identity) rather than as an unexplained number; financial-audit XAI work shows attribute-level explanations are materially easier for reviewers to use.

## Product decision

Create a read-only finance review queue.

The queue ranks open Laudus obligations using:
- overdue days;
- outstanding amount;
- partial-payment state;
- unresolved supplier identity.

Presentation order:
1. conclusion / priority;
2. evidence;
3. uncertainty;
4. next action.

The queue does not:
- create MOTIL payables;
- record payments;
- reconcile bank movements;
- auto-link purchase orders;
- overwrite canonical suppliers.

## Current scoring v1

Deterministic and explainable:
- >= 90 days overdue: +45
- >= 30 days overdue: +35
- > 0 days overdue: +25
- due but current: +10
- outstanding >= CLP 10M: +30
- outstanding >= CLP 3M: +20
- outstanding >= CLP 1M: +10
- partial payment: +10
- unresolved supplier identity: +15

Priority:
- high >= 70
- medium >= 40
- low < 40

This is a review-priority score, not a credit-risk score and not a fraud score.

## Value hypothesis

Current level: L3 — Intelligence.

Data connected -> financial context -> prioritized exceptions -> human review -> future measured decision-time reduction.

Do not claim ROI until MOTIL captures:
- time spent reviewing payables before/after;
- number of cases reviewed per session;
- acceptance/rejection of suggested identity links;
- reasons for rejection;
- errors caught before payment;
- time from source arrival to resolved decision.

## Next evolution

When enough reviewed labels exist:
- calibrate entity matching against human decisions;
- add PO/receipt candidate evidence only where canonical coverage is sufficient;
- evaluate anomaly ranking against manually confirmed exceptions;
- preserve a holdout set before using learned models;
- consider L4 decision assistance only after measurable precision and review-time gains.


## Priority concentration baseline

Measured on the current Laudus open-balance corpus:
- 1,183 open positive documents.
- 118 high-priority documents under deterministic v1.
- Those 118 documents represent CLP 864,746,032, or 45.2% of the source-derived outstanding balance.
- Top 10 ranked documents represent 7.8% of outstanding balance.
- Top 25 represent 21.6%.
- Top 50 represent 31.2%.

Interpretation:
- the queue is materially concentrating financial review effort;
- this is not a credit-risk, fraud, or default probability score;
- the measured value proposition is review prioritization and attention compression, not autonomous financial judgment.

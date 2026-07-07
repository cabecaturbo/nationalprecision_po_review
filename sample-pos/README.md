# Sample POs (test fixtures)

Two fictional purchase orders for exercising the app. Same PO number
(`4500089217`), Rev A → Rev B — a realistic revision from a made-up aerospace
OEM (Aerionics Defense Systems) buying a 6205 bearing from National Precision
Bearing. No real company or data.

- `PO-4500089217_RevA_ORIGINAL.pdf` — upload as **Original PO**
- `PO-4500089217_RevB_REVISED.pdf` — upload as **Revised PO**

**Compare** should report 6 changed + 1 added field:

| Field | Original → Revised | Status |
|---|---|---|
| Quantity | 24 EA → 36 EA | CHANGED |
| Unit price | $18.50 → $17.25 | CHANGED |
| Extended price | $444.00 → $621.00 | CHANGED |
| Payment terms | Net 30 → Net 45 | CHANGED |
| Need-by date | 09/15/2026 → 08/25/2026 | CHANGED |
| Carrier / routing | UPS Ground → FedEx 2Day | CHANGED |
| Carrier account # | — → 3Z-A1B2C3 | ADDED |
| Quality clauses | +DFARS traceability, +AS9102 FAI | CHANGED |

**Review** (RevB alone) yields the field card + a quality-clause summary. The
referenced quality URL is intentionally unreachable (fictional company), which
exercises the "URL couldn't be reached" handling.

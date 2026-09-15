# NEC Table Verification Checklist

Status of the physical-codebook verification pass called for in `README.md`
("Known gaps") and in each table file's sourcing note.

## How to use this

1. Get free read access to the official text: register (free, email only) at
   nfpa.org for the NFPA 70 (2023) online viewer. Free-access program:
   https://www.nfpa.org/for-professionals/codes-and-standards/list-of-codes-and-standards/free-access
2. Open the table this file lists and compare it row-by-row against
   `src/core/tables/*.ts`.
3. Check the box below once a table is confirmed against the physical/official
   text (not just against another secondary source).
4. Once *all* tables a given calculator depends on are checked, the
   "unverified transcription" banner for that calculator can come out of the
   UI and the sourcing-note comment in the table file can be updated to say
   verified, by whom, and on what date/edition.

## Cross-check pass completed 2026-09-15 (AI review against training data — NOT a substitute for step 2 above)

No discrepancies found in any populated table. This reduces risk (catches
transcription typos/digit-swaps) but does **not** count as verification
against the physical NFPA 70 text, since it's checking one secondary source
(this model's training data) against another (the existing transcription).

| # | Table | File | AI cross-check | Physical-text check |
|---|---|---|---|---|
| 1 | 310.16 — Ampacities | `table310_16.ts` | ✅ exact match | ☐ |
| 2 | 430.250 — Motor FLC (3-phase) | `table430.ts` | ✅ exact match | ☐ |
| 3 | 430.7(B) — NEMA code letter kVA/HP | `table430.ts` | ✅ exact match | ☐ |
| 4 | 250.122 — EGC sizing | `table250_122.ts` | ✅ exact match | ☐ |
| 5 | 240.6(A) — Standard OCPD sizes | `table240_6.ts` | ✅ exact match | ☐ |
| 6 | 240.4(D) — Small-conductor OCPD caps | `table240_6.ts` | ✅ exact match | ☐ |
| 7 | 310.15(B)(1) — Ambient correction | `table310_15.ts` | ✅ exact match | ☐ |
| 8 | 310.15(C)(1) — CCC adjustment | `table310_15.ts` | ✅ exact match | ☐ |
| 9 | Ch.9 Table 1 — Fill percentages | `chapter9.ts` | ✅ exact match | ☐ |
| 10 | Ch.9 Table 4 — EMT conduit areas | `chapter9.ts` | ✅ exact match | ☐ |
| 11 | Ch.9 Table 5 — THHN conductor areas | `chapter9.ts` | ✅ exact match | ☐ |
| 12 | Ch.9 Table 9 — AC resistance/reactance | `chapter9.ts` | ⚠️ spot-checked only — lower confidence, more decimal precision than reliably recalled | ☐ **priority** |

## Not yet populated (unchanged from README "Known gaps")

- NEC Table 430.251 does not exist as a real citation (already correctly
  handled — LRA is resolved via nameplate/code-letter/design-letter instead).
- Table 220.12 — only `office` and `warehouse_storage` populated.
- Chapter 9 Table 9 sizes/materials outside the current 14 AWG–1000 kcmil
  Cu/Al range, if any additional sizes are ever needed.

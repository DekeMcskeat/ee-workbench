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

## Physical-text pass completed 2026-09-15 (against a real NFPA 70 PDF the user supplied — `2017-NEC-Code-2.pdf`)

This is the real step-2 check the checklist calls for, but note the edition
mismatch: the sourcing notes in every table file claim NEC **2023**, while
the PDF checked against is the **2017** edition. All rows below are checked
against 2017 text only — re-confirm against a 2023 copy before calling the
"NEC 2023" claim in the code comments verified. (For the specific tables
checked here — 310.15(B)(16)/former 310.16, 310.15(B)(2)(a)/(3)(a), 430.250,
430.7(B), 250.122, 240.6(A), 240.4(D) — these tables are known to be
unchanged 2017→2023, so the values themselves should still hold; the
edition-label mismatch is a documentation issue, not a data one.)

Found and fixed one real transcription bug (not caught by the AI cross-check
pass): `table430.ts`, Table 430.250, 1.5 HP row, 575V column was `2.1`;
the physical text gives `2.4` (the wrong value matches the 1 HP row's 460V
entry, suggesting a copy/paste slip). Corrected in `table430.ts`.

| # | Table | File | AI cross-check | Physical-text check |
|---|---|---|---|---|
| 1 | 310.16 — Ampacities | `table310_16.ts` | ✅ exact match | ✅ exact match vs. 2017 text |
| 2 | 430.250 — Motor FLC (3-phase) | `table430.ts` | ✅ exact match | ⚠️ **found error, fixed**: 1.5 HP/575V was 2.1, corrected to 2.4 |
| 3 | 430.7(B) — NEMA code letter kVA/HP | `table430.ts` | ✅ exact match | ✅ exact match vs. 2017 text |
| 4 | 250.122 — EGC sizing | `table250_122.ts` | ✅ exact match | ✅ exact match vs. 2017 text |
| 5 | 240.6(A) — Standard OCPD sizes | `table240_6.ts` | ✅ exact match | ✅ exact match vs. 2017 text |
| 6 | 240.4(D) — Small-conductor OCPD caps | `table240_6.ts` | ✅ exact match | ✅ exact match vs. 2017 text |
| 7 | 310.15(B)(1) — Ambient correction | `table310_15.ts` | ✅ exact match | ✅ exact match vs. 2017 text |
| 8 | 310.15(C)(1) — CCC adjustment | `table310_15.ts` | ✅ exact match | ✅ exact match vs. 2017 text |
| 9 | Ch.9 Table 1 — Fill percentages | `chapter9.ts` | ✅ exact match | ✅ exact match vs. 2017 text |
| 10 | Ch.9 Table 4 — EMT conduit areas | `chapter9.ts` | ✅ exact match | ✅ exact match vs. 2017 text (all 8 EMT rows) |
| 11 | Ch.9 Table 5 — THHN conductor areas | `chapter9.ts` | ✅ exact match | ✅ exact match vs. 2017 text |
| 12 | Ch.9 Table 9 — AC resistance/reactance | `chapter9.ts` | ⚠️ spot-checked only — lower confidence, more decimal precision than reliably recalled | ⚠️ **needs a closer look**: most rows matched, but the 8 AWG copper / steel-conduit resistance cell looked like it might read `0.69` Ω/1000ft in the scanned PDF vs. `0.78` in `chapter9.ts` — image resolution wasn't reliable enough at that decimal precision to be certain. **Priority: re-check this one cell (and neighboring rows) against a sharp physical/PDF copy before trusting this table for anything precision-sensitive.** |

## Not yet populated (unchanged from README "Known gaps")

- NEC Table 430.251 does not exist as a real citation (already correctly
  handled — LRA is resolved via nameplate/code-letter/design-letter instead).
- Table 220.12 — only `office` and `warehouse_storage` populated.
- Chapter 9 Table 9 sizes/materials outside the current 14 AWG–1000 kcmil
  Cu/Al range, if any additional sizes are ever needed.

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
| 12 | Ch.9 Table 9 — AC resistance/reactance | `chapter9.ts` | ⚠️ spot-checked only — lower confidence, more decimal precision than reliably recalled | ✅ **resolved**: the earlier `0.69` reading was a column mix-up, not a transcription error — `0.69` is the table's "Effective Z at 0.85 PF, Uncoated Copper, PVC Conduit" column, a different quantity from AC resistance. `0.78` is confirmed correct for 8 AWG Cu resistance (`rPvc`/`rSteel`) against the 2017 text. |

## Formula check completed 2026-09-15 — point-to-point fault current method (`calcDownstreamScc`)

This isn't a table-transcription check (`calcDownstreamScc` in
`src/core/calc/transformer.ts` doesn't use an NEC table at all — it's an
IEEE/Bussmann fault-current *method*), but the same "confirm before trusting"
standard applies since it feeds fault-current results directly.

Found and fixed one real formula bug: the `f`-factor was dividing by
`lineToLineVoltage` in addition to the conductor constant `C`. The standard
published Point-to-Point Method (Cooper Bussmann SPD handbook; same shape in
IEEE Std 241/242 and other manufacturers' application guides) is
`f = (1.73 x L x I) / (C x N)` — voltage is already encoded in how the
C-value tables are derived and does not reappear as a separate divisor. The
extra voltage term made feeders look like they attenuate available fault
current far less than they actually do (non-conservative for an
interrupting-rating check). Corrected in `transformer.ts`; the now-unused
`lineToLineVoltage` input was removed from `DownstreamSccInput` and from the
UI's Fault Current tool (`ui/src/nodeTools.ts`).

The conductor constant `C` itself is unchanged: it remains a required,
explicitly-sourced user input, not a table this app embeds — published
C-value tables are proprietary reference data (e.g. Bussmann SPD), not NEC
text, so per house policy they are never fabricated here. Re-verify the
specific `C` value you enter against your own point-to-point reference.

## Data-fill pass completed 2026-09-15 — large conductors (Table 310.16) and high-HP motors (Table 430.250)

Entered from the same 2017 NFPA 70 PDF used for the physical-text pass
above, closing two gaps previously listed under "Not yet populated." This
is a data-entry pass, not a second independent physical-text check the way
the rows in the table above were double-checked — treat these new rows the
same as every other not-yet-double-checked row in this codebase (flagged
in the table-file sourcing comment, pending a final physical-codebook
check before being marked fully verified).

| # | Table | File | Rows added | Status |
|---|---|---|---|---|
| 13 | 310.16 — Ampacities, large conductors | `table310_16.ts` | 700, 800, 900, 1250, 1500, 1750, 2000 kcmil (Cu + Al, 60/75/90°C) | ⏳ entered, pending final physical-codebook check |
| 14 | 430.250 — Motor FLC, high HP | `table430.ts` | 125–500 HP (460/575V only — 200/208/230V dashed/not rated at these HP in the source table) | ⏳ entered, pending final physical-codebook check |

New validation cases V11 (large-conductor ampacity + `nextSizeUp` sort-order)
and V12 (high-HP motor FLC + `calcLoad` motor VA) in
`src/tests/validation.test.ts` exercise these rows.

Reminder (unchanged from the note above): Chapter 9 Table 9 (voltage-drop
R/X data) does not extend past 1000 kcmil in the NEC itself, so
voltage-drop-dependent tools correctly still throw `UnverifiedTableValueError`
above 1000 kcmil even with the Table 310.16 fill above — that's expected NEC
table coverage, not a gap in this pass.

## Not yet populated (unchanged from README "Known gaps")

- NEC Table 430.251 does not exist as a real citation (already correctly
  handled — LRA is resolved via nameplate/code-letter/design-letter instead).
- Table 220.12 — only `office` and `warehouse_storage` populated.
- Chapter 9 Table 9 sizes/materials outside the current 14 AWG–1000 kcmil
  Cu/Al range, if any additional sizes are ever needed.
- Table 430.250's unity-power-factor column for *synchronous* motors
  (230/460/575/2300V, 25 HP+) — not modeled at all; would need a
  motor-type (induction vs. synchronous) distinction, not just more rows.

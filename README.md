# EE Workbench — Calculation Kernel

A TypeScript calculation kernel for electrical engineering design work:
voltage drop, conductor sizing, conduit fill, branch/feeder load calcs,
transformer sizing, and power-factor correction — all built on NEC 2023
tables, with a full audit trail (`trace`) on every result and a strict
**no-fabrication policy**: if a table value hasn't been independently
verified, the code throws instead of guessing.

## Opening in VS Code

1. Unzip this folder and open it in VS Code (`File > Open Folder…`).
2. Open a terminal in VS Code (`` Ctrl+` ``) and install dependencies:
   ```bash
   npm install
   ```
3. Build the TypeScript:
   ```bash
   npm run build
   ```
4. Run the test suite (type-check + Vitest):
   ```bash
   npm test
   ```
   Or run Vitest directly:
   ```bash
   npm run test:watch   # Vitest watch mode
   npx vitest run src/tests/validation.test.ts        # V1–V10 hand-derivation checks
   npx vitest run src/tests/anti-fabrication.test.ts  # proves missing-input / unverified-table guards throw
   npx vitest run src/tests/fieldVariance.test.ts     # field-vs-design variance, thresholds, no-fabrication edge cases
   ```
   You can also launch the suite with a debugger via the **Run and Debug**
   panel (`.vscode/launch.json` is preconfigured).

## Project structure

```
ee-workbench/
├── src/
│   ├── core/
│   │   ├── calc/         # the calculation modules
│   │   │   ├── voltageDrop.ts        exact + K-factor %VD, two methods cross-checked
│   │   │   ├── conductorSizing.ts    iterative ampacity + VD sizing, OCPD, EGC (250.122)
│   │   │   ├── conduitFill.ts        Chapter 9 Table 1/4/5 fill % check
│   │   │   ├── loadCalc.ts           Table 220.12 lighting + receptacle + motor VA
│   │   │   ├── parallelConductors.ts parallel-set ampacity, 310.10(H) min-size check
│   │   │   ├── transformer.ts        FLA, point-to-point SCC, interrupting-rating check
│   │   │   ├── pfCorrection.ts       capacitor kVAR sizing + harmonic resonance flag
│   │   │   ├── motorStarting.ts      LRA resolution, starting current, terminal/bus voltage dip
│   │   │   ├── panelBalance.ts       A/B/C phase loading + imbalance flag from a circuit list
│   │   │   └── fieldVariance.ts      field-measurement-vs-design-result variance (%VD, phase imbalance) + warning thresholds
│   │   ├── tables/       # NEC reference data (each file documents its sourcing/verification status)
│   │   │   ├── table310_16.ts    Ampacities (60/75/90°C)
│   │   │   ├── table310_15.ts    Ambient + CCC derating factors
│   │   │   ├── table250_122.ts   EGC sizing
│   │   │   ├── table240_6.ts     Standard OCPD sizes + 240.4(D) caps
│   │   │   ├── table430.ts       Motor FLC (430.250) + LRA resolution (nameplate / 430.7(B) code letter / design-letter rule of thumb — never 430.251, which doesn't exist)
│   │   │   └── chapter9.ts       Conduit fill areas + AC resistance/reactance (Table 9)
│   │   ├── domain/
│   │   │   ├── trace.ts       shared result/trace/warning/assumption types
│   │   │   ├── errors.ts      MissingRequiredInputError, UnverifiedTableValueError, OutOfTableRangeError, NoFieldMeasurementError
│   │   │   ├── node.ts        one-line node type (NodeType, OneLineNode, ALLOWED_CHILDREN)
│   │   │   └── fieldCheck.ts  field-recorded measurement type (FieldCheck) — kept separate from OneLineNode.data/.result
│   │   ├── persistence/  # IndexedDB (Dexie)-backed, per the spec's data model
│   │   │   ├── db.ts               Dexie database (v2 schema) + one-time localStorage->IndexedDB migration
│   │   │   ├── projectStore.ts     Project CRUD (async) — Project also carries an optional per-project `branding` (firm name / license-or-contact line)
│   │   │   ├── nodeStore.ts        OneLineNode CRUD, cascade delete (async) — also cascades field checks
│   │   │   └── fieldCheckStore.ts  FieldCheck CRUD (async) — an append-only measurement log, never mutated in place
│   │   ├── report/
│   │   │   ├── pdf.ts     PDF generation (pdf-lib): `generateCalcPackagePdf` (trace, warnings, assumptions, disclaimer, signature block, optional field-verification-history section), `generatePanelDirectoryPdf` (print-ready panel nameplate + circuit directory), `generateBomPdf` (project-wide Schedule/bill-of-materials) — all three honor optional project `branding` in place of the default "EE Workbench" header
│   │   │   └── csv.ts     CSV export (panel schedule, calc trace, bill-of-materials, optional field-verification-history section) via papaparse — every export's first line is the branding header line (`csvBrandingHeaderLine`)
│   │   └── units/
│   │       └── quantity.ts  minimal, auditable unit conversions
│   └── tests/            # Vitest suites (`npm test`)
│       ├── validation.test.ts        hand-derived V1–V10 cases, executable proof of correctness
│       ├── anti-fabrication.test.ts  proves the no-silent-defaults / no-fabrication rules throw at runtime
│       ├── panelBalance.test.ts      dedicated unit tests: 1/2/3-pole taps, 1ph_3w vs 3ph_4w, >20% imbalance threshold
│       ├── transformer.test.ts       calcDownstreamScc point-to-point method + checkInterruptingRating
│       ├── fieldVariance.test.ts     field-vs-design variance: thresholds, boundaries, 0%-design edge case, no-fabrication proofs
│       └── report.test.ts            report-layer coverage: branding applied to PDF/CSV headers, bill-of-materials CSV/PDF (empty project, empty per-node spec)
├── ui/src/
│   ├── App.tsx              Workbench / One-line / Field / Schedule views, shared shell (rail, projects, audit modal)
│   ├── uiKit.tsx             small presentational pieces (Input, Select, ErrorState, AuditModal, WARNING_STYLE) shared by App.tsx and FieldView.tsx — AuditModal renders each trace step's `codeRefs` as inline pills and its `formulaLatex` as plain text
│   ├── FieldView.tsx         Field verification view — see "Field verification" below
│   ├── nodeTools.ts          NodeType → SubTool config table (fields, run(), metric(), rows(), optional fieldCheck config, optional bomRow() for the Schedule rollup) + `bomRowsForNode`/`bomRowFromTools`
│   ├── nodeTools.test.ts     bomRowFromTools/bomRowsForNode edge cases: no bomRow-declaring sub-tool, no `.result` yet, a multi-sub-tool node type reading the right one
│   ├── nodeRef.ts            short node reference + "#field/<ref>" deep-link helpers, derived from a node's id
│   └── errorPresentation.ts  classifies thrown errors into input/coverage/domain/unverified for display
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .vscode/   (settings, launch config, extension recommendations)
```

## Known gaps (by design, not oversight)

These are called out in code comments and enforced by throwing errors rather
than silently guessing — treat them as the Phase 2 backlog. See
[`VERIFICATION.md`](VERIFICATION.md) for the table-by-table checklist tracking
progress toward verifying every table against the physical NFPA 70 text.

- **Motor locked-rotor current (LRA)**: NEC Tables 430.248-430.251 are
  FULL-LOAD CURRENT tables — there is no NEC-tabulated LRA-by-HP table, and
  citing 430.251 for LRA (an earlier spec error) has been corrected.
  `resolveMotorLra()` in `core/tables/table430.ts` sources LRA in priority
  order: (1) manufacturer nameplate, (2) NEC Table 430.7(B) / NEMA MG 1
  locked-rotor code letter back-solve (conservative upper-bound of the
  kVA/HP band), (3) NEMA design-letter rule of thumb (B ~6-7x FLC, C
  ~4.5-5x, D ~6-8x) — always logged as an explicit `engineering_judgment`
  assumption, never silently defaulted. If none of the three is supplied it
  throws. Validation case V4 (`core/calc/motorStarting.ts`) is unblocked and
  passing using the design-letter path.
- **NEC Chapter 9 Table 9 (AC resistance/reactance)** is now fully populated,
  14 AWG-1000 kcmil, copper and aluminum, cross-verified against two
  independent transcriptions of the official table text with exact
  agreement. This was the only remaining gap blocking aluminum conductors —
  Table 310.16 and Table 250.122 were already complete for Al. Material
  (Cu/Al) is now selectable in every UI form that touches Table 9: the
  Workbench's voltage drop, conductor sizing, and motor starting tools, and
  the one-line Feeder and Motor node types. Sizes outside 14 AWG-1000 kcmil
  still throw `UnverifiedTableValueError` rather than extrapolating.
- **NEC Table 220.12 (general lighting loads)** only has `office` and
  `warehouse_storage` populated; other occupancy types throw until verified.
- **NEC Table 310.16 (ampacities)** now extends through 2000 kcmil (700, 800,
  900, 1250, 1500, 1750, 2000 kcmil added 2026-09-15, Cu and Al, all three
  temp ratings). Chapter 9 Table 9 (voltage-drop R/X data) genuinely does not
  extend past 1000 kcmil in the NEC itself, so voltage-drop-dependent tools
  (`calcVoltageDrop`, `sizeConductor`, `calcMotorStarting`) still correctly
  throw `UnverifiedTableValueError` above 1000 kcmil — that's expected NEC
  table coverage, not a bug. See `VERIFICATION.md`.
- **NEC Table 430.250 (motor FLC)** now extends through 500 HP (125-500 HP
  added 2026-09-15, 460/575V only — 200/208/230V are dashed/not rated in the
  source table at these HP ratings, so they're left out rather than
  guessed). See `VERIFICATION.md`.
  - **Not modeled (future item, out of scope for the above fill):** Table
    430.250 also has a distinct unity-power-factor column for *synchronous*
    motors (230/460/575/2300V, populated from 25 HP up), which this app
    doesn't represent at all — every motor tool here assumes induction.
    Adding it means introducing a motor-type distinction (induction vs.
    synchronous), not just more table rows, so it needs its own design pass
    rather than being bolted onto a data-fill change.
- All tables carry an "unverified transcription" sourcing note — they're
  cross-checked across multiple third-party sources but not yet re-keyed
  against the physical NFPA 70 codebook. Surface this in any UI that displays
  table-derived values.
- `core/calc/transformer.ts`'s `calcDownstreamScc` implements the standard
  Bussmann SPD / IEEE 241-242 "point-to-point method" (`f = 1.73 x L x I /
  (C x N)`, `M = 1/(1+f)`). This formula shape is now confirmed — an earlier
  version also divided `f` by line-to-line voltage, which isn't part of the
  published method and understated how much a feeder attenuates fault
  current; that bug is fixed and the unused `lineToLineVoltage` input
  removed (see `VERIFICATION.md`). The conductor constant `C` itself
  remains a required, explicitly-sourced **user input** by design — its
  reference tables (by conductor size/material/conduit) are proprietary
  Bussmann-style data, not NEC text, so this app does not embed them; the
  value used is always logged as an assumption.

## Design rules enforced by `core/domain/errors.ts`

1. **Conservative** — no silent defaults. Any missing required input throws
   `MissingRequiredInputError`.
2. **No fabrication** — unverified or out-of-range table lookups throw
   (`UnverifiedTableValueError`, `OutOfTableRangeError`) rather than
   interpolating or returning a best guess.

Every calc module returns a `CalcResult<T>` (see `core/domain/trace.ts`)
containing the numeric result, a step-by-step `trace` with LaTeX formulas and
substitutions (for PE-level audit), `warnings` (violation/warning/info), and
explicit `assumptions` — so nothing in the final number is unaccounted for.

## UI

`ui/src/App.tsx` (Vite + React, `npm run ui` for dev, `npm run ui:build` for
`../ui-dist`) has four views, switchable from the rail:

- **One-line** (default) — a real project workflow. Each project is a
  *forest* of `OneLineNode` trees — one or more root Utility sources (e.g.
  dual-utility feeds, or a generator modeled as a second source), each
  growing Utility → Transformer → Panel → Feeder/Motor/Load and enforced by
  `ALLOWED_CHILDREN`. The tree card's header "+" adds another root utility
  source at any time; the one-time "Add utility source" button only appears
  for a brand-new, still-empty project. Selecting a node shows the calc tool(s)
  relevant to its type (`ui/src/nodeTools.ts` maps node type → sub-tool →
  kernel calc function → form fields, generically rendered so no per-node
  form is hand-duplicated). Nodes are **linked**, not just organized:
  - A Panel's Phase Balance tab auto-pulls VA/tap from its child Load nodes
    and VA (computed from HP/voltage via Table 430.250 FLC, always tapped
    'ABC' since every motor here is 3-phase) from its child Motor nodes
    (`calcPanelBalance`), and lets you edit a Load child's phase tap directly
    from the parent's table.
  - A Feeder or Motor's "available fault current" field can pull its value
    from the parent Transformer/Utility/Feeder's last computed result
    (`resolveParentFaultCurrent`), rather than being re-typed by hand.
  - A Feeder's Fault Current tab wires `calcDownstreamScc` +
    `checkInterruptingRating` into the UI (previously kernel-only).
  Every node's result and inputs persist per-project (`nodeStore.ts`) and
  export to a real PDF calc package or CSV (panel schedule / trace) from the
  result card. A Panel's Phase Balance tab has an additional **Panel
  directory** PDF export (`generatePanelDirectoryPdf`) — a compact,
  print-ready nameplate + circuit directory table meant to actually be taped
  inside the panel door, separate from the full calc-package export. Voltage
  and main breaker/lugs rating are optional nameplate fields entered directly
  on that tab (never derived from the load calc), and a branch circuit's
  breaker/OCPD rating is likewise an optional as-installed field — all left
  blank rather than guessed when not entered.
- **Workbench** — the original seven stateless quick-calculators (voltage
  drop, conduit fill, conductor sizing, load calc, transformer sizing, PF
  correction, motor starting), for one-off checks outside a project.
- **Field** — a read-heavy, mobile-width-friendly commissioning/as-built view
  (`ui/src/FieldView.tsx`). See "Field verification" below.
- **Schedule** — a project-wide bill-of-materials rollup: one flat row per
  one-line node (name, type, and a short type-appropriate spec summary —
  e.g. a transformer's kVA/voltage, a feeder's chosen conductor size + OCPD,
  a panel's phase configuration + imbalance%), read live from the same node
  state every other view uses, so it updates as the project changes with no
  separate fetch or cache. Each node type declares its own spec shape via an
  optional `SubTool.bomRow()` in `nodeTools.ts` rather than the rollup
  special-casing node types; a computed spec (conductor size, OCPD,
  imbalance%) reads from the node's already-cached `.result` and shows "not
  yet calculated" — never a fabricated number — when that result is missing
  or belongs to the node's other sub-tool (this app caches only the most
  recently *viewed* sub-tool's result per node, not one slot per sub-tool).
  Exports to PDF (`generateBomPdf`) or CSV (`bomCsv`).

Every result panel, in every view, links to an audit modal showing the full
`trace` — including each step's `formulaLatex` and `codeRefs` (rendered as
small pills, the same reference format used in the PDF/CSV exports) — plus
three-tier warnings (violation/warning/info, each distinctly colored), and
every logged `assumption` — per the "every number traceable" requirement.
The UI imports the kernel directly from `src/core` — no duplicated logic.

**Report branding** (`Project.branding`, edited from the Projects panel):
an optional, project-level (not global) firm/company name and license-or-
contact line, applied to every PDF export's header in place of the default
"EE Workbench" string and as the first line of every CSV export
(`csvBrandingHeaderLine`/`brandName` in `report/csv.ts`). Text-only for
now — a logo-image upload/embed is a reasonable follow-up (pdf-lib does
support embedding a PNG) but isn't built this pass.

**Error presentation** (`ui/src/errorPresentation.ts`): every calc failure is
classified before it's shown, not just dumped as a raw error string —
`input` (a blank/invalid field — user can fix it right now), `coverage` (a
table-data gap in this build, not the user's mistake), or `domain` (valid
inputs, invalid combination, e.g. a code rule this tool enforces). Each gets
distinct color/copy. Separately, node-tool forms validate every visible
required numeric field *before* running a calc (blank fields coerce to `0`
via `+value`, not `NaN`, so this catches a class of bug the kernel's own
`MissingRequiredInputError` can't), and every computed result is scanned for
non-finite numbers (`NaN`/`Infinity`, e.g. from a divide-by-zero) before
being shown — either case degrades to the same friendly "input" message
instead of ever rendering literal "NaN%" or "Infinity%" text.

## Field verification

A commissioning/as-built workflow: office engineers produce the design calc
in One-line, field engineers verify it against reality in **Field** — without
ever overwriting the design data.

- **Data model.** A `FieldCheck` (`core/domain/fieldCheck.ts`) is a
  timestamped, append-only measurement row — `{ nodeId, subToolId, measured,
  note? }` — persisted in its own Dexie table (`fieldChecks`, `db.ts` v2
  schema) via `fieldCheckStore.ts`, never merged into `OneLineNode.data` or
  `.result`. Recording a measurement always inserts a new row (a commissioning
  log, not a mutable field), so history is preserved; deleting a node or
  project cascades to its field checks (`nodeStore.ts`).
- **Which sub-tools are field-checkable is config-driven**, the same pattern
  `nodeTools.ts` already uses for forms/results: a `SubTool` can carry an
  optional `fieldCheck: { fields, computeVariance }`. Today that's the Feeder
  Conductor-sizing tool (measured %VD) and the Panel Phase-balance tool
  (measured per-leg current, clamp-meter style) — the two calcs a field
  engineer can practically re-measure with handheld instruments.
- **Variance logic** (`core/calc/fieldVariance.ts`) follows the kernel's own
  rules: it takes the *live* design `CalcResult` (recomputed from stored
  inputs, not trusted from a possibly-stale `node.result` cache shared across
  a node's sub-tools) and the field measurement, and returns a `CalcResult`
  carrying `designValue`/`measuredValue`/`absoluteVariance`/`percentVariance`
  plus a `CalcWarning` — `warning` past `FIELD_VARIANCE_WARNING_PCT` (10%),
  `violation` past `FIELD_VARIANCE_VIOLATION_PCT` (20%, named constants, not
  magic numbers) — so it renders through the same `AuditModal`/callout UI as
  every other calc, not a new visual language. No measurement yet, or no
  design result yet, throws (`NoFieldMeasurementError` /
  `MissingRequiredInputError`) rather than showing a silent "0%"/"OK" — see
  `anti-fabrication.test.ts` and `fieldVariance.test.ts`.
- **Short reference + deep link** (`ui/src/nodeRef.ts`): every node gets a
  short, stable 8-character reference derived from its id (no schema change
  needed). A `#field/<ref>` URL hash jumps straight to that node's Field view
  once its project's nodes are loaded — from a typed/pasted link, or text you
  could encode into a QR code externally (this app doesn't generate the QR
  image itself this pass). Scope note: the hash only encodes the node, not
  its project, so it resolves against whichever project is currently loaded —
  consistent with this app's single-browser, no-sync persistence model.
- **Export.** A node's existing PDF/CSV export optionally appends a "Field
  verification history" section (design value, measured value, variance,
  date, note per recorded check) rather than shipping as a separate report
  type (`report/pdf.ts`, `report/csv.ts`).

## Next steps to make this a full app

- **Persistence backend** is now IndexedDB via Dexie (`core/persistence/`),
  matching the spec's data model — both stores are async (Promise-returning)
  behind the same function-based interface the earlier localStorage
  implementation used, so no caller outside `core/persistence/` needed to
  change its data model, only to `await`. A one-time migration
  (`db.ts`'s `migrateFromLocalStorageOnce`) imports any pre-existing
  localStorage project/node data on first load so upgrading doesn't lose
  it. Still single-browser (IndexedDB isn't synced across devices) — that
  would need a real backend/sync layer, out of scope here.
- **Bus/Conductor/ProtectionDevice as first-class entities** — the one-line
  node holds a calc module's raw form inputs, not the richer typed entities
  the original spec's data model describes. Works, but a node's "type" of
  data is duck-typed by its node type + sub-tool id, not a validated schema.
- Complete the flagged table gaps above from the physical NFPA 70 text.
- **Offline PWA support for Field** — the Field view is the workflow most
  likely to be used somewhere without reliable signal (inside a switchgear
  room, a basement electrical closet). It already reads/writes only local
  IndexedDB, so no network calls block it once the page is loaded, but there's
  no service worker/app-shell caching or install prompt yet, so a field
  engineer still needs one successful page load before going offline. A real
  PWA pass (manifest, service worker precache, an "installed app" icon) is a
  natural, scoped next step and doesn't require the sync work below.
- **Cross-device sync for field checks** — right now a field measurement
  recorded on a phone in the field and a design calc done on an office laptop
  only reconcile if they're the *same browser profile*, because persistence
  is local IndexedDB with no backend (see "Known gaps" above — this was
  already true for project data generally, and the Field verification pass
  keeps to that same constraint rather than quietly introducing a new backend
  dependency). Making field checks actually flow from a field device back to
  the office needs a real sync layer: an authenticated backend, a
  project/field-check schema versioned for merge conflicts (two field
  engineers checking the same panel), and a decision about whether design
  data stays local-first (edited office-side, synced read-only to field
  devices) or fully bidirectional.

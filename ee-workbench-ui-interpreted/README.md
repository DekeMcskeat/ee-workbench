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
4. Run the test suites:
   ```bash
   npm test
   ```
   Or run them individually:
   ```bash
   npm run test:validation        # V1–V8 hand-derivation checks
   npm run test:anti-fabrication  # proves missing-input / unverified-table guards throw
   ```
   You can also launch either test with a debugger via the **Run and Debug**
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
│   │   │   └── panelBalance.ts       A/B/C phase loading + imbalance flag from a circuit list
│   │   ├── tables/       # NEC reference data (each file documents its sourcing/verification status)
│   │   │   ├── table310_16.ts    Ampacities (60/75/90°C)
│   │   │   ├── table310_15.ts    Ambient + CCC derating factors
│   │   │   ├── table250_122.ts   EGC sizing
│   │   │   ├── table240_6.ts     Standard OCPD sizes + 240.4(D) caps
│   │   │   ├── table430.ts       Motor FLC (430.250) + LRA resolution (nameplate / 430.7(B) code letter / design-letter rule of thumb — never 430.251, which doesn't exist)
│   │   │   └── chapter9.ts       Conduit fill areas + AC resistance/reactance (Table 9)
│   │   ├── domain/
│   │   │   ├── trace.ts    shared result/trace/warning/assumption types
│   │   │   ├── errors.ts   MissingRequiredInputError, UnverifiedTableValueError, OutOfTableRangeError
│   │   │   └── node.ts     one-line node type (NodeType, OneLineNode, ALLOWED_CHILDREN)
│   │   ├── persistence/  # localStorage-backed v1 stand-in for the spec's Dexie/IndexedDB model
│   │   │   ├── projectStore.ts   Project CRUD
│   │   │   └── nodeStore.ts      OneLineNode CRUD, cascade delete
│   │   ├── report/
│   │   │   ├── pdf.ts     PDF calc-package generator (pdf-lib) — trace, warnings, assumptions, disclaimer, signature block
│   │   │   └── csv.ts     CSV export (panel schedule, calc trace) via papaparse
│   │   └── units/
│   │       └── quantity.ts  minimal, auditable unit conversions
│   └── tests/
│       ├── validation.ts        hand-derived V1–V9 cases, executable proof of correctness
│       └── anti-fabrication.ts  proves the no-silent-defaults / no-fabrication rules throw at runtime
├── package.json
├── tsconfig.json
└── .vscode/   (settings, launch config, extension recommendations)
```

## Known gaps (by design, not oversight)

These are called out in code comments and enforced by throwing errors rather
than silently guessing — treat them as the Phase 2 backlog:

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
- All tables carry an "unverified transcription" sourcing note — they're
  cross-checked across multiple third-party sources but not yet re-keyed
  against the physical NFPA 70 codebook. Surface this in any UI that displays
  table-derived values.
- `core/calc/transformer.ts`'s `calcDownstreamScc` uses a point-to-point
  conductor constant `C` that is explicitly flagged `[VERIFY]` — confirm
  against a trusted point-to-point reference before relying on it.

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
`../ui-dist`) has two modes, switchable from the rail:

- **One-line** (default) — a real project workflow. Each project is a tree
  of `OneLineNode`s (Utility → Transformer → Panel → Feeder/Motor/Load,
  enforced by `ALLOWED_CHILDREN`). Selecting a node shows the calc tool(s)
  relevant to its type (`ui/src/nodeTools.ts` maps node type → sub-tool →
  kernel calc function → form fields, generically rendered so no per-node
  form is hand-duplicated). Nodes are **linked**, not just organized:
  - A Panel's Phase Balance tab auto-pulls VA/tap from its child Load nodes
    (`calcPanelBalance`) and lets you edit a child's phase tap directly from
    the parent's table.
  - A Feeder or Motor's "available fault current" field can pull its value
    from the parent Transformer/Utility/Feeder's last computed result
    (`resolveParentFaultCurrent`), rather than being re-typed by hand.
  - A Feeder's Fault Current tab wires `calcDownstreamScc` +
    `checkInterruptingRating` into the UI (previously kernel-only).
  Every node's result and inputs persist per-project (`nodeStore.ts`) and
  export to a real PDF calc package or CSV (panel schedule / trace) from the
  result card.
- **Workbench** — the original seven stateless quick-calculators (voltage
  drop, conduit fill, conductor sizing, load calc, transformer sizing, PF
  correction, motor starting), for one-off checks outside a project.

Every result panel, in both modes, links to an audit modal showing the full
`trace` (formula + substitution + code refs), three-tier warnings
(violation/warning/info, each distinctly colored), and every logged
`assumption` — per the "every number traceable" requirement. The UI imports
the kernel directly from `src/core` — no duplicated logic.

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

## Next steps to make this a full app

- **Persistence backend** is localStorage, not the spec's Dexie/IndexedDB —
  fine for a single-browser demo, but swap it (both stores are already
  isolated behind a small function interface, see `core/persistence/`)
  before relying on it for real project data or multi-device use.
- **Bus/Conductor/ProtectionDevice as first-class entities** — the one-line
  node holds a calc module's raw form inputs, not the richer typed entities
  the original spec's data model describes. Works, but a node's "type" of
  data is duck-typed by its node type + sub-tool id, not a validated schema.
- Panel auto-aggregation only reads **Load**-type children (not Motor) into
  the phase-balance schedule — noted in the UI copy, not silently wrong, but
  worth closing.
- Port `src/tests/*.ts` into a real test runner (Vitest/Jest) — the file
  headers note this is a drop-in change (swap `assertClose`/`assertTrue` for
  `expect()`, wrap blocks in `describe`/`it`). The new `panelBalance.ts`
  module has no dedicated unit-test file yet either — its only coverage is
  validation case V9.
- Complete the flagged table gaps above from the physical NFPA 70 text.

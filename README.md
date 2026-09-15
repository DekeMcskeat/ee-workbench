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
│   │   │   └── pfCorrection.ts       capacitor kVAR sizing + harmonic resonance flag
│   │   ├── tables/       # NEC reference data (each file documents its sourcing/verification status)
│   │   │   ├── table310_16.ts    Ampacities (60/75/90°C)
│   │   │   ├── table310_15.ts    Ambient + CCC derating factors
│   │   │   ├── table250_122.ts   EGC sizing
│   │   │   ├── table240_6.ts     Standard OCPD sizes + 240.4(D) caps
│   │   │   ├── table430.ts       Motor FLC (430.250) — LRA (430.251) intentionally unpopulated
│   │   │   └── chapter9.ts       Conduit fill areas + AC resistance/reactance (Table 9)
│   │   ├── domain/
│   │   │   ├── trace.ts    shared result/trace/warning/assumption types
│   │   │   └── errors.ts   MissingRequiredInputError, UnverifiedTableValueError, OutOfTableRangeError
│   │   └── units/
│   │       └── quantity.ts  minimal, auditable unit conversions
│   └── tests/
│       ├── validation.ts        hand-derived V1–V8 cases, executable proof of correctness
│       └── anti-fabrication.ts  proves the no-silent-defaults / no-fabrication rules throw at runtime
├── package.json
├── tsconfig.json
└── .vscode/   (settings, launch config, extension recommendations)
```

## Known gaps (by design, not oversight)

These are called out in code comments and enforced by throwing errors rather
than silently guessing — treat them as the Phase 2 backlog:

- **NEC Table 430.251 (locked-rotor current)** is not populated. `lookupMotorLra()`
  always throws `UnverifiedTableValueError`. This blocks motor-starting
  voltage-dip studies (see validation case V4, which is skipped for this reason).
- **NEC Chapter 9 Table 9 (AC resistance/reactance)** only includes sizes where
  independent sources agreed (12 AWG–500 kcmil, a subset). Other sizes throw.
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

## Next steps to make this a full app

This kernel currently has no UI or CLI entry point — it's the calculation
core plus its executable proof (`src/tests`). Natural next steps:
- Wire a CLI or web front end (React/Vite) that calls these functions and
  renders the `trace`/`warnings`/`assumptions` for the user.
- Port `src/tests/*.ts` into a real test runner (Vitest/Jest) — the file
  headers note this is a drop-in change (swap `assertClose`/`assertTrue` for
  `expect()`, wrap blocks in `describe`/`it`).
- Complete the flagged table gaps above from the physical NFPA 70 text.

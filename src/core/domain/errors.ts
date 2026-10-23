/**
 * Domain error types. These enforce two non-negotiable spec rules at runtime:
 *   6. Conservative — unknown values must be entered by the user, never defaulted.
 *   11. No fabrication — unverified table values throw, they don't return a guess.
 */

export class MissingRequiredInputError extends Error {
  constructor(fieldName: string) {
    super(`Required input '${fieldName}' was not provided. No silent defaults permitted.`);
    this.name = 'MissingRequiredInputError';
  }
}

export class UnverifiedTableValueError extends Error {
  constructor(tableRef: string, lookup: string, guidance: string) {
    super(`[VERIFY] ${tableRef} entry for ${lookup} is not in the verified dataset. ${guidance}`);
    this.name = 'UnverifiedTableValueError';
  }
}

export class OutOfTableRangeError extends Error {
  constructor(tableRef: string, detail: string) {
    super(`${tableRef}: value falls outside the tabulated range (${detail}). NEC prohibits silent extrapolation — obtain manufacturer data or use the Neher-McGrath / engineering-supervision exception where applicable, and record it as an explicit assumption.`);
    this.name = 'OutOfTableRangeError';
  }
}

/**
 * A field/design comparison was requested but no field measurement has been
 * recorded yet. Distinct from MissingRequiredInputError (a design-calc input
 * gap) — this is specifically "nothing to compare against yet", which the UI
 * renders as a neutral "not yet verified" state rather than a fixable error.
 */
export class NoFieldMeasurementError extends Error {
  constructor(detail: string) {
    super(`[NOT YET VERIFIED] ${detail}`);
    this.name = 'NoFieldMeasurementError';
  }
}

export function requireDefined<T>(value: T | undefined | null, fieldName: string): T {
  if (value === undefined || value === null) {
    throw new MissingRequiredInputError(fieldName);
  }
  return value;
}

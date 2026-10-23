/**
 * Turns a thrown error (or a computed-but-broken result) into a message a
 * user can actually act on, instead of a raw stack-trace-flavored string or
 * a silently-rendered "NaN%"/"Infinity%".
 *
 * Four distinct failure kinds get four distinct framings:
 *  - 'input'      — something the user can fix right now (a blank/invalid field).
 *  - 'coverage'   — a table-data gap in THIS APP, not a mistake the user made.
 *  - 'domain'     — the inputs are individually valid but the combination
 *                   violates a rule this tool enforces (e.g. a code error, a
 *                   convergence failure).
 *  - 'unverified' — a field-vs-design comparison has nothing to compare yet
 *                   (no field measurement recorded). Not an error the user
 *                   needs to "fix" — a neutral, expected state.
 */
import { MissingRequiredInputError, UnverifiedTableValueError, OutOfTableRangeError, NoFieldMeasurementError } from '../../src/core/domain/errors';

export type ErrorKind = 'input' | 'coverage' | 'domain' | 'unverified' | 'unknown';
export interface PresentedError { kind: ErrorKind; heading: string; detail: string }

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputValidationError';
  }
}

export function presentError(error: unknown): PresentedError {
  if (error instanceof InputValidationError) {
    return { kind: 'input', heading: 'Missing or invalid input', detail: error.message };
  }
  if (error instanceof MissingRequiredInputError) {
    return { kind: 'input', heading: 'Missing or invalid input', detail: error.message };
  }
  if (error instanceof UnverifiedTableValueError) {
    return { kind: 'coverage', heading: "This app doesn't have that value verified yet", detail: error.message };
  }
  if (error instanceof OutOfTableRangeError) {
    return { kind: 'coverage', heading: 'Outside the tabulated range', detail: error.message };
  }
  if (error instanceof NoFieldMeasurementError) {
    return { kind: 'unverified', heading: 'Not yet verified', detail: error.message };
  }
  if (error instanceof Error) {
    return { kind: 'domain', heading: "That combination isn't valid", detail: error.message };
  }
  return { kind: 'unknown', heading: 'Something went wrong', detail: 'Unable to calculate.' };
}

/** Formats a number for display, never emitting the literal strings "NaN" or "Infinity". */
export function fmt(n: number, decimals = 2): string {
  return Number.isFinite(n) ? n.toFixed(decimals) : '—';
}

/**
 * True if any numeric leaf in a computed result is NaN/Infinity — meaning
 * the calculation "succeeded" (didn't throw) but produced garbage, usually
 * from a blank field silently coercing to 0 and then dividing something.
 * Used to downgrade a "successful" result into a friendly input error
 * instead of rendering broken numbers.
 */
export function hasNonFiniteNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasNonFiniteNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasNonFiniteNumber);
  return false;
}

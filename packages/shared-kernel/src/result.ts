/**
 * Result<T, E> — Railway-oriented programming pattern.
 *
 * RULE: No throw in business logic. All functions return Result<T, E>.
 * Exceptions only at infra layer (DB connections, etc.) and always caught at boundary.
 *
 * @see ADR-002-result-pattern.md
 */

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Wrap a success value */
export const ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

/** Wrap an error value */
export const err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

/**
 * Wrap an async function that may throw.
 * Catches all exceptions and converts to Result<T, Error>.
 * Use ONLY at infra boundaries, not in business logic.
 */
export async function tryAsync<T>(
  fn: () => Promise<T>,
): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Wrap a sync function that may throw.
 * Catches all exceptions and converts to Result<T, Error>.
 */
export function trySync<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Map the success value of a Result.
 * Short-circuits on error (does not call fn).
 */
export function mapOk<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map the error of a Result.
 * Short-circuits on success (does not call fn).
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  if (!result.ok) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chain Result operations (flatMap).
 * Short-circuits on error.
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/**
 * Unwrap the value or throw the error.
 * Only use at application boundaries (e.g., route handlers).
 */
export function unwrapOrThrow<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(String(result.error));
}

/**
 * Collect an array of Results into a Result of array.
 * Fails fast on first error.
 */
export function collectResults<T, E>(
  results: ReadonlyArray<Result<T, E>>,
): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

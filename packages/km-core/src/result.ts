/**
 * Result Type - Explicit Success/Failure Handling
 *
 * Use Result for expected failures the caller should handle.
 * Use exceptions for bugs, corruption, "should never happen".
 *
 * The test: Can the caller reasonably recover? → Result. Otherwise → Throw.
 *
 * @example
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return Err("division by zero")
 *   return Ok(a / b)
 * }
 *
 * const result = divide(10, 2)
 * if (result.ok) {
 *   console.log(result.value) // 5
 * } else {
 *   console.log(result.error) // never reached
 * }
 */

/**
 * Result type - discriminated union for success/failure.
 *
 * @typeParam T - The success value type
 * @typeParam E - The error type
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

/**
 * Create a success Result.
 */
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

/**
 * Create a failure Result.
 */
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })

/**
 * Pre-constructed success Result for void returns.
 * Use this instead of Ok(undefined) for clarity.
 */
export const OkVoid: Result<void, never> = { ok: true, value: undefined }

/**
 * Type guard for success Result.
 */
export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok
}

/**
 * Type guard for failure Result.
 */
export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok
}

/**
 * Map over success value, leaving errors unchanged.
 */
export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  if (r.ok) return Ok(fn(r.value))
  return r
}

/**
 * Chain results (flatMap). If success, apply fn which returns a new Result.
 */
export function andThen<T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> {
  if (r.ok) return fn(r.value)
  return r
}

/**
 * Combine multiple results. Returns first error or array of all values.
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const r of results) {
    if (!r.ok) return r
    values.push(r.value)
  }
  return Ok(values)
}

/**
 * Wrap a throwing function in a Result.
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return Ok(fn())
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)))
  }
}

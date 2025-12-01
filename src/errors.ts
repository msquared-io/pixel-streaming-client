/**
 * Error handling utilities that provide controlled and typed error catching.
 *
 * This module provides utilities to safely catch, check, and unwrap errors with type safety.
 * It allows catching specific error types while ensuring other errors are rethrown,
 * and ensures all errors are proper Error instances.
 *
 * @module
 *
 * @example
 * import errors from './errors'
 *
 * class CustomError extends Error {}
 *
 * // Unwrapping nested errors
 * const customErr = errors.as(err, CustomError)
 *
 * // Catch specific error types
 * const result = errors.catch(() => {
 *   throw new CustomError()
 * }, CustomError) // Returns CustomError
 */

// biome-ignore lint/suspicious/noExplicitAny: using unknown here causes type errors at the usage site.
type Constructor<T extends Error = Error> = new (...args: any[]) => T
type ErrorOrConstructor<V extends Error = Error> = V | Constructor<V>
type OutputType<T extends ErrorOrConstructor> =
  T extends Constructor<infer R> ? R : T
type OutputTypes<T extends readonly ErrorOrConstructor[]> = OutputType<
  T[number]
>

/**
 * Type guard that checks if a value matches a target error type.
 * Works with both error constructors and error instances.
 * When no target is provided, checks if value is any Error.
 *
 * @template V - The type of the value being checked
 * @template T - The specific Error type to check against
 *
 * @param value - The value to check
 * @param target - Error constructor or instance to match against (defaults to Error)
 * @returns Type guard narrowing value to any types in V that are subtypes of T if it matches
 *
 * @example
 * class CustomError extends Error {}
 *
 * if (errors.is(err)) {
 *   // err is constrained to Error here
 * }
 *
 * if (errors.is(err, CustomError)) {
 *   // err is constrained to subtypes of CustomError here
 * }
 *
 * if (errors.is(err, new CustomError())) {
 *   // err is explicitly CustomError here
 * }
 */
function is<V, T extends ErrorOrConstructor<V extends Error ? V : Error>>(
  value: V,
  target: T = Error as unknown as T,
): value is Extract<V, OutputType<T>> {
  if (typeof target === "function") {
    return value instanceof target
  }

  if (value instanceof Error) {
    return value === target
  }

  return false
}

/**
 * Ensures a value is wrapped as an Error instance. If the value is already an Error,
 * returns it directly. Otherwise creates a new Error with the value as its cause.
 *
 * @param cause - The value to wrap in an Error
 * @returns The original Error or a new Error wrapping the cause
 *
 * @example
 * errors.wrap(new Error("oops"))
 * // Returns the original error
 *
 * errors.wrap("something went wrong")
 * // Returns Error("unknown error") with cause="something went wrong"
 */
function wrap(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause
  }

  return new Error("unknown error", { cause })
}

/**
 * Executes a function and catches any thrown errors, wrapping them if needed.
 *
 * @template T - The return type of the function
 * @param fn - The function to execute
 * @returns Either the function's return value or the caught error (wrapped if not already an Error)
 *
 * @example
 * const result = errors.catch_(() => {
 *   throw "oops"
 * }) // Returns Error("unknown error") with cause="oops"
 */
function catch_<T>(fn: () => T): T | Error

/**
 * Executes a function and catches specific types of errors.
 * Only catches errors matching the provided error types - other errors are rethrown.
 *
 * @template T - The return type of the function
 * @template Es - Tuple type of error constructors or instances to catch
 * @param fn - The function to execute
 * @param errors - Error constructors or instances to catch
 * @returns Either the function's return value or a caught error of one of the specified types
 * @throws If a caught error doesn't match any of the provided error types
 *
 * @example
 * class CustomError extends Error {}
 *
 * const result = errors.catch_(() => {
 *   throw new CustomError()
 * }, CustomError) // Returns the CustomError
 *
 * errors.catch_(() => {
 *   throw new Error()
 * }, CustomError) // Error is rethrown as it doesn't match CustomError
 */
function catch_<T, Es extends ErrorOrConstructor[]>(
  fn: () => T,
  ...errors: Es
): T | OutputTypes<Es>
function catch_<T, Es extends ErrorOrConstructor[]>(
  fn: () => T,
  ...errors: Es
): T | Error | OutputTypes<Es> {
  try {
    return fn()
  } catch (e) {
    if (errors.length === 0) {
      return wrap(e)
    }

    for (const error of errors) {
      if (is(e, error)) {
        return e
      }
    }

    throw e
  }
}

/**
 * Type-safely unwraps an error to a specific error type by traversing the error chain.
 * Checks if the error or any of its causes (recursively) matches the target type.
 *
 * @template T - The specific Error type to unwrap to
 * @template V - The type of the value being checked
 *
 * @param value - The error to check and unwrap
 * @param target - Error constructor or instance to match against
 * @returns The first error in the chain that matches the target type, or undefined if none match
 *
 * @example
 * class CustomError extends Error {}
 *
 * try {
 *   // ...some code that might throw
 * } catch (err) {
 *   const customErr = errors.as(err, CustomError)
 *   if (customErr) {
 *     // Handle the specific error type
 *   }
 * }
 */
function as<V, T extends ErrorOrConstructor>(
  value: V,
  target: T,
): T extends Constructor<infer R> ? R : T extends Error ? T : never
function as<V, T extends ErrorOrConstructor<V extends Error ? V : Error>>(
  value: V,
  target: T = Error as unknown as T,
): Extract<V, OutputType<T>> | undefined {
  // Check the current error
  if (is(value, target)) {
    return value as Extract<V, OutputType<T>>
  }

  // Check if the value is an Error and has a cause
  if (value instanceof Error && value.cause !== undefined) {
    // Recursively check the cause chain
    return as(value.cause, target) as Extract<V, OutputType<T>> | undefined
  }

  return undefined
}

export default { is, wrap, catch: catch_, as }

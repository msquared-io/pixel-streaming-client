/**
 * Provides runtime invariant checking functionality with typed error handling.
 *
 * This module exports an InvariantError class and an invariant assertion function
 * that can be used to enforce runtime conditions and constraints in code.
 * The invariant function is intended to be stripped out in production builds.
 *
 * @module
 *
 * @example
 * import { invariant } from './invariant'
 *
 * function divide(a: number, b: number) {
 *   invariant(b !== 0, "Cannot divide by zero")
 *   return a / b
 * }
 */

/**
 * Custom error class for invariant violations.
 * Thrown when an invariant check fails.
 *
 * @extends Error
 *
 * @example
 * throw new InvariantError("User ID must be defined")
 */
export class InvariantError extends Error {
  constructor(message?: string) {
    super(message ?? "invariant does not hold")
    this.name = "InvariantError"
  }
}

/**
 * Asserts that a condition is truthy, throwing an InvariantError if it's not.
 * Used to enforce invariants and preconditions in code.
 *
 * WARNING: As an `assertion` function, this is the only place in this package
 * where we expect an Error to thrown rather than returned. It should _only_
 * be used to assert invariants you **know** to be true but, for some reason,
 * cannot be represented in the type system.
 *
 * @param value - The condition to check
 * @param message - Optional custom error message if the assertion fails
 * @throws {InvariantError} If the condition is falsy
 *
 * @example
 * function processUser(user: unknown) {
 *   invariant(user != null, "User must be defined")
 *   // TypeScript now knows user is not null/undefined
 *   return user.id
 * }
 */
export function invariant(value: unknown, message?: string): asserts value {
  if (!value) {
    throw new InvariantError(message)
  }
}

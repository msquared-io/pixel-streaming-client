export type Token = string | (() => string | Promise<string>)
export type Fetch = typeof globalThis.fetch

/**
 * Logger interface for client debugging and monitoring.
 */
export type Logger = {
  debug(...data: unknown[]): void
  error(...data: unknown[]): void
  info(...data: unknown[]): void
  log(...data: unknown[]): void
  trace(...data: unknown[]): void
  warn(...data: unknown[]): void
}

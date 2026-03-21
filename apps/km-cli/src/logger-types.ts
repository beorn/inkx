/**
 * Extended logger type for km-cli.
 *
 * The loggily package exports ConditionalLogger and SpanLogger types, but they
 * don't resolve under verbatimModuleSyntax + bundler moduleResolution because
 * loggily's index.ts re-exports from "./core.js" (a .js path for .ts files).
 *
 * This type mirrors the runtime API that createLogger() actually returns,
 * allowing km-cli code to use .span() and pass data objects without type errors.
 */
export interface FullLogger {
  readonly name: string
  trace?: (msg: string, data?: Record<string, unknown>) => void
  debug?: (msg: string, data?: Record<string, unknown>) => void
  info?: (msg: string, data?: Record<string, unknown>) => void
  warn?: (msg: string, data?: Record<string, unknown>) => void
  error?: ((msg: string | Error, data?: Record<string, unknown>) => void) | undefined
  span: (namespace: string, props?: Record<string, unknown>) => FullSpanLogger
}

/** Span logger with Disposable support for `using` */
export interface FullSpanLogger extends FullLogger, Disposable {
  end(): void
}

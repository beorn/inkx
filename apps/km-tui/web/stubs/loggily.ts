/** Browser stub for loggily — no-op logger with span support.
 *
 * The Proxy returns arbitrary methods (debug/info/warn/error/span/child)
 * that the real loggily exposes, so the shape has to stay structurally
 * compatible without importing loggily's type here. `unknown` forces
 * callers to type their call sites; `never` preserves chainability. */
type NoopLogger = {
  [key: string | symbol]: (...args: unknown[]) => NoopLogger
}

function noopLogger(): NoopLogger {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === Symbol.dispose || prop === Symbol.asyncDispose) return () => {}
      if (prop === "span") return () => noopLogger()
      if (prop === "child") return () => noopLogger()
      return () => {}
    },
  }
  return new Proxy({}, handler) as NoopLogger
}

export function createLogger(): NoopLogger {
  return noopLogger()
}

export default createLogger

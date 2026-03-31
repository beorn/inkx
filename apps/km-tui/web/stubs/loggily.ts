/** Browser stub for loggily — no-op logger with span support */
function noopLogger(): any {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === Symbol.dispose || prop === Symbol.asyncDispose) return () => {}
      if (prop === "span") return () => noopLogger()
      if (prop === "child") return () => noopLogger()
      return () => {}
    },
  }
  return new Proxy({}, handler)
}

export function createLogger() {
  return noopLogger()
}

export default createLogger

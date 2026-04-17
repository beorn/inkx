# Conditional Logging Research

Background research for the optional chaining pattern in Loggily.

## The Problem

When logging is disabled, traditional loggers still evaluate arguments:

```typescript
// Even when debug is disabled, expensiveState() is STILL called
log.debug("state: %o", computeExpensiveState())
```

This is wasted work. In hot code paths (rendering loops, per-node operations), this overhead adds up.

## Solution: Optional Chaining

JavaScript's optional chaining (`?.`) skips argument evaluation entirely when the method is undefined:

```typescript
// When log.debug is undefined, the entire call is skipped
// computeExpensiveState() is NEVER called
log.debug?.("state: %o", computeExpensiveState())
```

## Benchmark Results (Bun 1.1.x, M1 Mac)

```
DISABLED LOGGING (no arguments evaluated)
1. noop function call                         2168M ops/s  0.5ns/op
2. optional chaining (?.) - undefined         1406M ops/s  0.7ns/op
3. proxy returning undefined + ?.              545M ops/s  1.8ns/op
4. proxy returning noop                        352M ops/s  2.8ns/op

DISABLED LOGGING (with expensive argument)
1. noop - args evaluated (wastes work)          17M ops/s  57.6ns/op
2. optional chaining - args NOT evaluated      408M ops/s   2.5ns/op  ← 22x faster
3. proxy + ?. - args NOT evaluated             168M ops/s   5.9ns/op
4. proxy + noop - args evaluated (wastes work)  15M ops/s  65.3ns/op
```

**Key insight**: For cheap arguments, noop is only ~0.2ns faster. For expensive arguments, optional chaining is **22x faster** because it skips argument evaluation entirely.

## External Research

### Matteo Collina's Analysis (2025)

Article: [Noop Functions vs Optional Chaining: A Performance Deep Dive](https://adventures.nodeland.dev/archive/noop-functions-vs-optional-chaining-a-performance/)

Collina (Pino maintainer) benchmarked that noop functions outperform optional chaining in raw call overhead. However, his test used cheap arguments. The benchmark above shows that the **real benefit** of `?.` is skipping expensive argument evaluation, which Collina's test didn't measure.

Quote: "Discover why noop functions are faster than optional chaining in JavaScript"

**Our finding**: This is only true for cheap args. When args are expensive, `?.` wins decisively.

### Lazy Logging in JavaScript (2023)

Article: [Lazy/conditional logging in JavaScript](https://tonisives.com/blog/2023/05/28/lazy-conditional-logging-in-javascript/)

Toni Sives describes passing functions to delay evaluation:

```typescript
Logger.trace(() => `long task took ${longRunningTask()}`)
```

This works but requires wrapping every call in an arrow function. Optional chaining is more ergonomic:

```typescript
log.trace?.(`long task took ${longRunningTask()}`)
```

### TC39 Explicit Resource Management

The `using` keyword (Stage 3 as of June 2024) enables automatic span disposal:

```typescript
{
  using span = log.span("operation")
  span.debug("working...")
} // Automatically calls span[Symbol.dispose]()
```

Reference: [TC39 Proposal](https://tc39.es/proposal-explicit-resource-management/)

### Proxy Performance (Historical)

Valeri Karpov's 2016 benchmarks showed Proxies were ~10x slower than direct property access. Modern V8 has improved significantly, but Proxy still adds overhead (~1-3ns per access). For logging, this is negligible compared to actual I/O.

Reference: [Thoughts on ES6 Proxies Performance](https://thecodebarbarian.com/thoughts-on-es6-proxies-performance)

## Implementation Approach

### Proxy Wrapper

```typescript
import { createLogger, getLogLevel } from "loggily"

const baseLog = createLogger("myapp")

const LEVEL_PRIORITY = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  silent: 5,
}

export const log = new Proxy(baseLog, {
  get(target, prop: string) {
    // For level methods, return undefined if disabled
    if (prop in LEVEL_PRIORITY) {
      const current = LEVEL_PRIORITY[getLogLevel() as keyof typeof LEVEL_PRIORITY]
      if (LEVEL_PRIORITY[prop as keyof typeof LEVEL_PRIORITY] < current) {
        return undefined
      }
    }
    return (target as unknown as Record<string, unknown>)[prop]
  },
})
```

### TypeScript Types

```typescript
interface ConditionalLogger {
  trace?: (msg: LazyMessage, data?: Record<string, unknown>) => void
  debug?: (msg: LazyMessage, data?: Record<string, unknown>) => void
  info?: (msg: LazyMessage, data?: Record<string, unknown>) => void
  warn?: (msg: LazyMessage, data?: Record<string, unknown>) => void
  error?: (msg: LazyMessage | Error, data?: Record<string, unknown>) => void
  logger(ns?: string, props?: Record<string, unknown>): Logger
  span(ns?: string, props?: Record<string, unknown>): SpanLogger
}
```

TypeScript enforces the `?.` pattern at compile time - you can't call `log.debug()` without `?.` because the method may be undefined.

## Design Decision: Always Use `?.`

Given the benchmark results:

- Overhead of `?.` vs noop for cheap args: ~0.2ns (negligible)
- Benefit of `?.` for expensive args: ~55ns saved (22x faster)

**Conclusion**: Always use `log.debug?.()`. The ergonomic cost is minimal (just add `?.`), and the performance benefit is significant when arguments involve any computation.

## Alternative: Lazy Evaluation

For very expensive argument preparation, use a function:

```typescript
log.debug?.(() => {
  const state = gatherComplexState()
  return ["state: %o", state]
})
```

The logger calls the function only if debug is enabled. This pattern is useful when you need to prepare multiple pieces of data that depend on each other.

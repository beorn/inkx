#!/usr/bin/env bun
/**
 * Benchmark: noop functions vs optional chaining for conditional logging
 *
 * Tests the deep research claim that noop functions are faster than optional chaining.
 * Reference: https://adventures.nodeland.dev/archive/noop-functions-vs-optional-chaining-a-performance/
 */

const ITERATIONS = 10_000_000

// Simulate expensive argument computation
function expensiveArg(): string {
  return `value-${Math.random()}`
}

// Cheap argument (just a string)
const cheapArg = "static-value"

// ============================================================
// Test subjects
// ============================================================

// 1. Noop function (traditional approach when logging disabled)
const noop = (..._args: unknown[]) => {}
const noopLog = { debug: noop }

// 2. Undefined method (optional chaining approach)
const undefinedLog = { debug: undefined as ((...args: unknown[]) => void) | undefined }

// 3. Real function (when logging enabled)
let sink = 0
const realLog = { debug: (msg: string, val: string) => { sink += msg.length + val.length } }

// 4. Proxy that returns undefined
const proxyLog = new Proxy({ debug: realLog.debug }, {
  get(target, prop) {
    return undefined  // Always disabled for benchmark
  }
})

// 5. Proxy that returns noop
const proxyNoopLog = new Proxy({ debug: realLog.debug }, {
  get() {
    return noop
  }
})

// ============================================================
// Benchmarks
// ============================================================

function bench(name: string, fn: () => void): void {
  // Warmup
  for (let i = 0; i < 10000; i++) fn()

  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    fn()
  }
  const elapsed = performance.now() - start
  const opsPerSec = (ITERATIONS / elapsed) * 1000
  const nsPerOp = (elapsed / ITERATIONS) * 1_000_000

  console.log(`${name.padEnd(45)} ${(opsPerSec / 1_000_000).toFixed(1)}M ops/s  ${nsPerOp.toFixed(1)}ns/op`)
}

console.log(`\nBenchmark: ${(ITERATIONS / 1_000_000)}M iterations each\n`)
console.log("=".repeat(70))
console.log("DISABLED LOGGING (no arguments evaluated)")
console.log("=".repeat(70))

// Disabled logging - no argument evaluation
bench("1. noop function call", () => {
  noopLog.debug("msg", cheapArg)
})

bench("2. optional chaining (?.) - undefined", () => {
  undefinedLog.debug?.("msg", cheapArg)
})

bench("3. proxy returning undefined + ?.", () => {
  proxyLog.debug?.("msg", cheapArg)
})

bench("4. proxy returning noop", () => {
  proxyNoopLog.debug("msg", cheapArg)
})

console.log("\n" + "=".repeat(70))
console.log("DISABLED LOGGING (with expensive argument)")
console.log("=".repeat(70))

// This is where optional chaining wins - expensive args skipped
bench("1. noop - args evaluated (wastes work)", () => {
  noopLog.debug("msg", expensiveArg())
})

bench("2. optional chaining - args NOT evaluated", () => {
  undefinedLog.debug?.("msg", expensiveArg())
})

bench("3. proxy + ?. - args NOT evaluated", () => {
  proxyLog.debug?.("msg", expensiveArg())
})

bench("4. proxy + noop - args evaluated (wastes work)", () => {
  proxyNoopLog.debug("msg", expensiveArg())
})

console.log("\n" + "=".repeat(70))
console.log("ENABLED LOGGING (actual work)")
console.log("=".repeat(70))

bench("Real function call (baseline)", () => {
  realLog.debug("msg", cheapArg)
})

bench("Real function call (expensive arg)", () => {
  realLog.debug("msg", expensiveArg())
})

console.log(`\nsink value (to prevent dead code elimination): ${sink}`)
console.log("\n--- Summary ---")
console.log("Key insight: Optional chaining wins when args are expensive because")
console.log("it skips argument evaluation entirely when the method is undefined.")
console.log("Noop functions must still evaluate all arguments before calling.")

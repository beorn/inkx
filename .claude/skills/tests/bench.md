---
description: Benchmarks with vitest bench - performance measurement
---

# Benchmarks (vitest bench)

Performance measurement via vitest benchmarks.

**Keywords**: benchmark, bench, performance, baseline, vitest bench

---

## Commands

| Command | What it does | Use case |
|---------|--------------|----------|
| `bun run bench` | Run all benchmarks | Measure performance |
| `bun run bench:baseline` | Create baseline for comparison | After optimization |
| `bun run bench:compare` | Compare against baseline | Detect regressions |

---

## File Pattern

- `benchmarks/*.bench.ts`

---

## Current Benchmarks

| File | Focus Area |
|------|------------|
| `sync.bench.ts` | File sync operations |
| `parser.bench.ts` | Markdown parsing |
| `layout.bench.ts` | TUI layout calculations |
| `queries.bench.ts` | Database queries |

---

## Example

```typescript
import { bench, describe } from "vitest"

describe("parser", () => {
  bench("parse small file", () => {
    parseMarkdown(smallContent)
  })

  bench("parse large file", () => {
    parseMarkdown(largeContent)
  })
})
```

---

## When to Use

- After optimization work - create baseline, then compare
- Before releases - check for performance regressions
- Investigating slow operations - isolate bottlenecks

---

## Fast Iteration

**IMPORTANT**: Full benchmark runs can take minutes. For quick iteration during development, use a dedicated quick-compare script with minimal iterations:

```bash
# Quick comparison (3 iterations instead of hundreds)
bun bench/quick-compare.ts 1500 3

# Full benchmark (slow but statistically accurate)
bun run bench
```

**Flexily example** (`vendor/flexily/bench/quick-compare.ts`):
```typescript
const iterations = parseInt(process.argv[3] || "3", 10)
// ... run minimal iterations for fast feedback
```

When debugging performance issues:
1. Create a `quick-compare.ts` script with configurable iteration count
2. Default to 3-5 iterations for ~1s total runtime
3. Only run full `bun bench` for final validation

---

## Note

Benchmarks are **not tests** - they measure performance, not correctness. Never say "benchmark test" - say "benchmark" or "bench".

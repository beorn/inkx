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

## Note

Benchmarks are **not tests** - they measure performance, not correctness. Never say "benchmark test" - say "benchmark" or "bench".

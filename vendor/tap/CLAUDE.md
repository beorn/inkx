# @beorn/tap

TAP stream orchestration: merge parallel test runners, convert formats (Bun JUnit, Playwright), beautiful terminal output.

## Commands

```bash
bun test              # Run all tests
bun run test:fast     # Fast tests only
bun run test:all      # All tests
bun run typecheck     # Type check
```

## Architecture

```
CLI (src/cli/runner.ts)
  └── Orchestrator (src/orchestrate.ts) — manage suites, merge streams
        ├── Merge (src/merge.ts) — combine multiple TAP streams
        ├── Consumer (src/consumer.ts) — parse TAP, produce summary
        └── Producers — format adapters
              ├── Bun (src/producers/bun.ts) — JUnit XML → TAP
              ├── Vitest (src/producers/vitest.ts) — TAP passthrough
              └── Playwright (src/producers/playwright.ts) — reporter → TAP
```

## Key Files

| File                   | Purpose                             |
| ---------------------- | ----------------------------------- |
| `src/orchestrate.ts`   | Suite orchestration, mode selection |
| `src/merge.ts`         | TAP stream merging                  |
| `src/consumer.ts`      | TAP parsing and summary generation  |
| `src/parallel-tui.ts`  | TUI for parallel test output        |
| `src/producers/bun.ts` | Bun JUnit → TAP conversion          |

## Subpath Exports

```typescript
import { createOrchestrator } from "@beorn/tap/orchestrate"
import { createConsumer } from "@beorn/tap/consumer"
import { mergeStreams } from "@beorn/tap/merge"
import { runBunTap } from "@beorn/tap/producers/bun"
```

## Code Style

Factory functions, no classes, no globals. ESM imports only. TypeScript strict mode.

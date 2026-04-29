---
id: "@km/infra/typecheck-oom"
aliases:
  - km-infra.typecheck-oom
  - km-infra-typecheck-oom
created_by: claude:cc081a9a
created_at: 2026-04-28T08:02:55Z
---

# [ ] TypeScript typecheck runs out of memory (SIGABRT) @km/infra #bug #P2

blocks:: [[@km/infra]]

- [ ] TypeScript typecheck runs out of memory (SIGABRT) @issue @bug @@km/infra

## Problem

Running `bun run typecheck` (which executes `tsc --noEmit`) crashes with SIGABRT due to JavaScript heap exhaustion.

## Error Output

```
<--- Last few GCs --->
[91283:0x97b80c000]   132486 ms: Mark-Compact 4026.0 (4128.1) -> 4010.4 (4128.6) MB, pooled: 5 MB, 1062.83 / 0.00 ms  (average mu = 0.109, current mu = 0.064) allocation failure; scavenge might not succeed
[91283:0x97b80c000]   133678 ms: Mark-Compact 4026.2 (4128.6) -> 4010.6 (4128.6) MB, pooled: 5 MB, 1187.67 / 0.00 ms  (average mu = 0.056, current mu = 0.004) allocation failure; scavenge might not succeed

<--- JS stacktrace --->

FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
error: Failed to run "tsc" due to signal SIGABRT
```

## Environment

- Node.js 22.22.0 (via Nix)
- Memory usage reaches ~4GB before crash
- Happens on full project typecheck

## Possible Solutions

1. **Increase heap size**: `NODE_OPTIONS="--max-old-space-size=8192" tsc --noEmit`
2. **Project references**: Use TypeScript project references to typecheck incrementally
3. **Reduce type surface**: Investigate if vendor submodules add excessive type complexity
4. **Skip lib check**: Enable `skipLibCheck: true` if not already set
5. **Isolate hot paths**: Profile which packages consume most memory during typecheck
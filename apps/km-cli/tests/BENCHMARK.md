# mdtest Performance Benchmark

## In-Process Execution Speedup

Comparison of subprocess (bunShell) vs in-process (km-repl) execution.

### Test Setup

**Workload:** 21 km commands (1 sync + 20 list)
- Subprocess: bunShell spawns `bun km` for each command
- In-process: executeKmCommand() calls km CLI directly

### Results (2026-01-26)

| Approach | Time | Speedup |
|----------|------|---------|
| Subprocess (bunShell) | 3.992s | baseline |
| **In-Process (km-repl)** | **0.246s** | **16.2x** ⚡ |

✅ **EXCEEDED TARGET:** 8-15x speedup goal

### Run Benchmark

```bash
# Subprocess
time bun run vendor/beorn-mdtest/src/index.ts /tmp/benchmark-subprocess.test.md

# In-process
time bun run vendor/beorn-mdtest/src/index.ts /tmp/benchmark-inprocess.test.md
```

### Why So Fast?

1. **No process spawning** - Direct function calls vs fork/exec overhead
2. **No module reloading** - Commander/libs loaded once, not per-command
3. **Memory database option** - SQLite :memory: eliminates disk I/O
4. **Output interception** - console.log captured in-memory vs piping

### Breakdown

Per-command overhead reduction:
- Subprocess: ~190ms per command (includes Bun startup, module load, exec)
- In-process: ~12ms per command (function call only)

**Process overhead eliminated:** ~178ms per command = ~3.8s for 21 commands

This matches our measured 3.746s difference (3.992s - 0.246s).

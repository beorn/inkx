---
description: Performance diagnostics and profiling. Use when debugging slow startup, laggy navigation, jank, stutter, event loop blocks, unresponsive UI, or any performance issue.
argument-hint: [startup|render|storage|diagnose]
allowed-tools: Task, Read, Glob, Grep, Bash
benefits-from: [recall, tests]
escalate-to: {render: "silvery pipeline bottleneck", arch: "algorithmic redesign needed for scalability"}
---

# Performance Diagnostics

**Keywords**: slow, perf, performance, lag, jank, stutter, unresponsive, event loop, blocked, timing, profile, benchmark, latency

Diagnose and fix performance issues across all layers: storage, board state, React rendering, silvery pipeline, and terminal output.

## Decision Tree

| Symptom | Start Here |
|---------|------------|
| Slow startup (loading repo) | [Storage layer](#storage-layer) |
| Slow board open / column rendering | [Board layer](#board-layer) |
| Laggy cursor navigation | [React layer](#react-layer) |
| Event loop blocked warnings | [Event loop blocks](#event-loop-blocks) |
| Visual garbling / tearing | [Output layer](#output-layer) |
| Need full profile | [Full profile](#full-profile) |

## Rule #1: Instrument First, Theorize Later

5 minutes of instrumentation beats 1 hour of code reading. See [docs/lessons/performance.md](/docs/lessons/performance.md) for why.

## Quick Diagnostics

```bash
# Full span trace — captures all layer timings
TRACE=1 TRACE_FORMAT=json bun km view --repo <path> <board> 2>trace.jsonl
bun km perf analyze trace.jsonl --sort total

# Event loop + render pipeline breakdown
DEBUG_LOG=/tmp/km.log bun km view --repo <path> <board>
# Heartbeat reports: "event loop blocked for 1173ms — key='l' → cursor_right — render: content=800ms output=200ms (total=1050ms)"

# silvery instrumentation (skip/render counts per frame)
SILVERY_INSTRUMENT=1 DEBUG=silvery:content DEBUG_LOG=/tmp/km.log bun km view --repo <path> <board>
# Output via loggily; also readable from globalThis.__silvery_content_detail

# Full render pipeline debug trace
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun km view --repo <path> <board>

# Incremental render correctness check
SILVERY_STRICT=1 bun km view --repo <path> <board>

# Profile startup phases in detail
VAULT=<path> bun apps/km-tui/tests/profile-startup.ts
```

## Environment Variables

### Logging & Spans

| Variable | Effect |
|----------|--------|
| `TRACE=1` | Enable ALL span timing output (per-operation timings) |
| `TRACE=km:tui,km:storage` | Enable spans for specific namespaces only |
| `TRACE_FORMAT=json` | JSON span output (pipe-friendly, use with `bun km perf analyze`) |
| `LOG_LEVEL=debug` | Enable debug logging (default: `warn`) |
| `DEBUG=km:*` | Enable debug for km namespaces (auto-lowers level) |
| `DEBUG=silvery:*` | Enable debug for silvery pipeline |
| `DEBUG='km:*,silvery:*'` | Both km and silvery |
| `DEBUG='km:*,-km:storage:sql'` | Exclude specific namespaces |
| `DEBUG_LOG=/tmp/km.log` | Redirect debug output to file (required for TUI — terminal is captured) |

### silvery Rendering

| Variable | Effect |
|----------|--------|
| `SILVERY_INSTRUMENT=1` | Render-phase counters: nodes visited/rendered/skipped, per-flag breakdown |
| `SILVERY_STRICT=1` | Compare incremental vs fresh render every frame (crashes on mismatch) |
| `SILVERY_DEV=1` | Enable inspector + warn on missing prevBuffer (incremental rendering disabled) |
| `SILVERY_PROFILE_RENDER=1` | Per-phase pipeline timing to stderr (measure, layout, scroll, content, output) |

### Other

| Variable | Effect |
|----------|--------|
| `DEBUG_DEVTOOLS=1` | Connect to React DevTools (flame graph) |
| `SILVERY_ENGINE=flexily\|yoga` | Select layout engine |

## Layer-by-Layer Diagnostics

### Storage Layer

**Symptom**: Slow repo load, high startup time

```bash
# Trace storage operations
TRACE=1 DEBUG=km:storage:* DEBUG_LOG=/tmp/km.log bun km view --repo <path> <board>
grep "SPAN km:storage" /tmp/km.log
```

**Key spans**: `km:storage:repo-loader` (file reading, parsing, reconciliation), `km:storage:db:queries` (SQL), name index build

**Key files**:
- `packages/km-storage/src/repo-loader.ts` — repo loading phases
- `packages/km-storage/src/db-queries/smart-resolver.ts` — `resolveNode()`, name index
- `packages/km-storage/src/db.ts` — `getNameIndex()`, `clearNameIndex()`

**Common issues**:
- `resolveNode` doing full SQL queries → check name index is built (`getNameIndex()`)
- Empty string in query → full table scan (guard exists, verify it's hit)
- Large LIKE queries on 256k nodes → check prefix/suffix scan guards

### Board Layer

**Symptom**: Slow board state construction, column derivation

```bash
TRACE=1 DEBUG=km:tui DEBUG_LOG=/tmp/km.log bun km view --repo <path> <board>
grep "SPAN km:tui" /tmp/km.log
```

**Key spans**: `km:tui:run-board` (total startup), `km:tui:run-board:render-setup` (React mount)

**Component timing** (per-column render time):
```bash
DEBUG_LOG=/tmp/km.log bun km view --repo <path> <board>
grep "\[layout\]" /tmp/km.log
# Output: "Column 3 "Projects" (48 cards): 142ms"
```

**Key files**:
- `apps/km-tui/src/hooks/use-component-timing.ts` — `useComponentTiming(label)`
- `apps/km-tui/src/views/Board.tsx:318` — `useComponentTiming("BoardCore")`
- `apps/km-tui/src/views/CardColumn.tsx:528` — per-column timing

### React Layer

**Symptom**: Laggy cursor navigation, slow re-renders

```bash
# Per-key timing (span includes dispatch + action phases)
TRACE=km:perf DEBUG_LOG=/tmp/km.log bun km view --repo <path> <board>
grep "SPAN km:perf" /tmp/km.log
# Output: "SPAN km:perf:key (12ms) {input: 'j', command: 'cursor_down'}"
```

**Key file**: `apps/km-tui/src/board-app.ts:196` — `using keySpan = perfLog.span("key", { input, gap })`

**React DevTools flame graph**:
```bash
DEBUG_DEVTOOLS=1 bun km view --repo <path> <board>
# Connect React DevTools, record profile, look for slow components
```

### Output Layer

**Symptom**: Visual garbling, tearing, screen corruption

The output phase generates ANSI diff output. Corruption typically means cursor position tracking divergence.

```bash
# Check incremental render correctness (buffer level)
SILVERY_STRICT=1 bun km view --repo <path> <board>

# Full output debug trace
DEBUG=silvery:pipeline:output DEBUG_LOG=/tmp/silvery.log bun km view --repo <path> <board>
```

**Key files**:
- `vendor/silvery/src/pipeline/output-phase.ts` — ANSI diff generation, cursor tracking
- `vendor/silvery/src/scheduler.ts` — frame scheduling, synchronized update wrapping

**Common issues**:
- textSizing (OSC 66) causing width tracking mismatch — disable with `textSizing: false`
- Large output (>100KB per frame) — check `render.spanData.bytes` in scheduler logs
- Synchronized update not preventing tearing — check `SILVERY_SYNC_UPDATE` env

### Event Loop Blocks

**Symptom**: `event loop blocked for Xms` warnings, frozen TUI

The heartbeat monitor in `apps/km-tui/src/tui.tsx` fires every 200ms and reports blocks >500ms. Enhanced output includes:
- **Last key**: which key/command triggered the block
- **Pipeline breakdown**: which phase (content, output, layout) was slow

```bash
DEBUG_LOG=/tmp/km.log bun km view --repo <path> <board>
grep "event loop blocked" /tmp/km.log
# Output: "event loop blocked for 1173ms — key='l' → cursor_right — render: content=800ms output=200ms (total=1050ms)"
```

**Interpreting phase timing**:

| Slow Phase | Likely Cause |
|-----------|-------------|
| `content` | Too many nodes rendered (check skip counts with SILVERY_INSTRUMENT) |
| `layout` | Flexily/Yoga layout on large tree (>3000 nodes) |
| `output` | Large ANSI output string (check bytes count) |
| `measure` | fit-content measurement on many nodes |
| No pipeline data | Block outside render (storage query, filesystem, etc.) |

## Diagnostic Output

Diagnostic output is routed through loggily structured logging. Use `DEBUG=silvery:content` for render phase stats, `TRACE=silvery:pipeline` for phase timing spans.

| Loggily Namespace | What |
|-------------------|------|
| `silvery:pipeline` | Frame-level spans with per-phase timing |
| `silvery:content` | Render phase stats per frame (render/skip counts) |
| `silvery:content:trace` | Per-node trace entries (skip/render decisions) |
| `silvery:content:cell` | Per-cell debug (node coverage at target coords) |
| `silvery:measure` | Measure phase debug (text measurement calls) |

Stats are also retained on globalThis for programmatic access:

| Variable | Set By | Contents |
|----------|--------|----------|
| `__silvery_last_pipeline` | `pipeline/index.ts` | Per-phase timing: `{ measure, layout, scroll, scrollRect, notify, content, output, total }` |
| `__silvery_content_detail` | `render-phase.ts` | Render-phase breakdown: nodes visited/rendered/skipped, per-flag counts, scroll tier info |
| `__silvery_content_all` | `render-phase.ts` | Array of all per-frame render-phase snapshots |
| `__km_last_key` | `board-app.ts` | Last key pressed + resolved command (e.g., `"j → cursor_down"`) |

Requires `SILVERY_INSTRUMENT=1` for content detail. Pipeline timing is always available.

## Benchmarks

```bash
bun run bench                    # All benchmarks
bun run bench:baseline           # Save baseline
bun run bench:compare            # Compare to saved baseline
```

| File | Measures |
|------|----------|
| `benchmarks/queries.bench.ts` | SQLite query performance |
| `benchmarks/parser.bench.ts` | Markdown parsing |
| `benchmarks/layout.bench.ts` | Layout engine |
| `apps/km-tui/tests/board.bench.ts` | Board component rendering |
| `apps/km-tui/tests/cursor-perf.bench.ts` | Cursor navigation |

## Full Profile

For comprehensive startup profiling with per-phase breakdown:

```bash
cd /Users/beorn/Code/pim/km
VAULT=/path/to/vault bun apps/km-tui/tests/profile-startup.ts
```

This measures: createRepo, buildBoardState, deriveColumnsFromRepo, buildNodeIndex, React mount, navigation timing, fold/unfold, preloadSubtree, zoom simulation. Activates `SILVERY_INSTRUMENT` internally.

## Span Trace Analysis

Capture and analyze span traces:

```bash
# Capture
TRACE=1 TRACE_FORMAT=json bun km view --repo <path> <board> 2>trace.jsonl

# Analyze (sort by total time, average, p95, max, or count)
bun km perf analyze trace.jsonl --sort total
bun km perf analyze trace.jsonl --sort avg --limit 20
bun km perf analyze trace.jsonl --json  # Machine-readable output
```

## Lessons Learned

See [docs/lessons/performance.md](/docs/lessons/performance.md) for the full story:

1. **Profile before fixing** — 5 min of instrumentation > 4 sessions of theorizing
2. **Measure after fixing** — "it feels faster" is not evidence
3. **The hot path is often in a different layer** — symptoms in React, root cause in SQL
4. **Progressive rendering can be slower** — yielding to event loop adds idle gaps
5. **Deep research is expensive per insight** — profiling questions don't need $1.50 API calls

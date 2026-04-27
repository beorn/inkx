---
description: Logging patterns — loggily namespaces, debug(), worker threads, file writers. Use when adding debug output, configuring loggers, building observability surfaces, or specifying log file paths in a bead.
argument-hint: [debug|logger|worker|file-writer]
allowed-tools: Read, Glob, Grep, Task
---

# Logging Patterns

**Keywords**: logging, debug, logger, worker thread, console output, DEBUG_LOG, JSONL, observability, namespace, log file, log levels, loggily

## The rule

**Loggily is the canonical observability primitive across this codebase.** Every subsystem that emits structured records — runtime traces, debug events, hint emissions, defense decisions, daemon activity — flows through `createLogger("namespace:thing")` from `loggily`. New subsystems do not reinvent file-JSONL logging; they pick a namespace and let the existing pipeline + writers handle delivery.

**Concrete rule**: if you find yourself writing `fs.appendFileSync(path, JSON.stringify(record) + "\n")` or exporting a local `createLogger` function, stop. The right primitive already exists. See "Why this rule exists" below for the failure mode it prevents.

## Quick reference

```typescript
import { createLogger, addWriter, createFileWriter } from "loggily"

// Pick a namespace tree that matches your subsystem.
// Convention: <project>:<subsystem>:<event-class>
const log = createLogger("km:storage:watch")
const tribeLog = createLogger("tribe:daemon")
const bgRecallLog = createLogger("bg-recall:hint")

// Emit structured records. Optional fields go in the second arg.
log.info("Syncing vault", { vaultPath, count })
log.debug?.("state dump", { state })       // .debug? for cheap-when-disabled
log.warn("Slow query", { ms, query })
log.error("Failed to write", { path, error })

// At app startup (host-app responsibility, not library code):
//   wire a file writer if the user wants persistent JSONL output.
const writer = createFileWriter(process.env.LOGGILY_FILE ?? "/tmp/loggily.log")
addWriter((formatted) => writer.write(formatted))
```

## When to use which

| Need                                   | Primitive                            |
| -------------------------------------- | ------------------------------------ |
| Structured runtime trace               | `createLogger("ns:thing")` from loggily |
| Per-namespace JSONL file output        | `addWriter(createFileWriter(path))` |
| Cheap-when-disabled deep diagnostics   | `log.debug?.("...", { ... })` (the `?.` short-circuits when level filters it out) |
| Console output at user-facing levels   | Same logger — info/warn/error always emit; level filter handles suppression |
| Worker thread → main thread forwarding | See [worker-threads.md](worker-threads.md) |
| `DEBUG=km:*` legacy `debug()` namespace pattern | Available via loggily — same namespace conventions |

## Naming convention

Three-segment dotless namespaces, colon-separated:

  - `<project>` — `km`, `tribe`, `silvery`, `bearly`, `bg-recall`, `injection`, `lore`, `accountly`
  - `<subsystem>` — `daemon`, `storage`, `render`, `dispatch`, `socket`, `recall`, `compose`
  - `<event-class>` (optional) — `trigger`, `hint`, `reject`, `score`, `query`, `cell`

Examples in current source:

```
silvery:render          tribe:daemon              bg-recall:trigger
silvery:layout          tribe:dispatch            bg-recall:score
silvery:measure         tribe:plugins             bg-recall:hint
bearly:llm:dual-pro     tribe-client:client       injection:sanitize
bearly:llm:openai       tribe-client:parser       injection:wrap
```

A new subsystem picks a namespace tree first; granular sub-namespaces let users filter via `DEBUG=ns:event-class` (e.g. `DEBUG=bg-recall:hint` to see only hints, `DEBUG=injection:*` for all defense decisions).

## CLI flags (km-tui)

```bash
bun km view /tmp/test           # Default (warn level)
bun km -v view /tmp/test        # Verbose (info level)
bun km -vv view /tmp/test       # More verbose (debug level)
bun km -vvv view /tmp/test      # Very verbose (trace level)
bun km -q view /tmp/test        # Quiet (error level only)
bun km -qq view /tmp/test       # Quieter (silent)
bun km --log-level trace view   # Explicit level
LOG_LEVEL=debug bun km view     # Env var
DEBUG=km:* bun km view          # Namespace filter
```

**Log levels:** `trace < debug < info < warn < error < silent`

## File writers — when a subsystem needs persistent JSONL

Three-step recipe at host-app startup (not in library code):

```typescript
import { addWriterFor, createFileWriter } from "loggily"

// One file shared across namespaces:
if (process.env.LOGGILY_FILE) {
  const writer = createFileWriter(process.env.LOGGILY_FILE)
  addWriter((formatted) => writer.write(formatted))
}

// Per-namespace files (when scenarios want separation):
if (process.env.LOGGILY_FILE_BG_RECALL) {
  addWriterFor("bg-recall:*", createFileWriter(process.env.LOGGILY_FILE_BG_RECALL))
}
if (process.env.LOGGILY_FILE_INJECTION) {
  addWriterFor("injection:*", createFileWriter(process.env.LOGGILY_FILE_INJECTION))
}
```

`tail -f $LOGGILY_FILE | jq 'select(.namespace | startswith("bg-recall"))'` replaces the older "set FOO_DEBUG_LOG and BAR_DEBUG_LOG separately and tail two files side-by-side" pattern.

## Anti-patterns (and why)

**Don't export a local `createLogger`.** A subsystem that ships its own `createLogger` shadows loggily's name in its namespace and bypasses the shared writer pipeline. Every other subsystem that uses loggily then can't see your subsystem's records, and your file format drifts. **Failure mode this caused (2026-04-27)**: `vendor/bearly/packages/bg-recall/src/log.ts` exported a parallel `createLogger`; `vendor/bearly/plugins/injection-envelope/src/debug.ts` used `fs.appendFileSync` directly. Two parallel pipelines, two env vars, two file paths to coordinate. Tracked in `km-bearly.unified-observability`.

**Don't write `fs.appendFileSync(path, line + "\n")` for log records.** That's loggily's `createFileWriter(path)` job. Direct file appends bypass formatting, level filtering, namespace tagging, and the structured-record pipeline.

**Don't name an env var `<SUBSYSTEM>_DEBUG_LOG` in a bead acceptance.** That's how the failure mode above started — the bead spec said "log via `BG_RECALL_DEBUG_LOG`", and a literal-following agent built a parallel file writer. **Bead-acceptance language for observability**: "namespace via loggily as `<ns>:*`; file output configurable via `LOGGILY_FILE` (and optionally `LOGGILY_FILE_<NS>` for per-namespace)."

**Don't put `addWriter` calls in library code.** Library code calls `createLogger("ns")`. Host apps wire writers at startup. Mixing the two means library tests start emitting to user file paths or every test run double-emits.

## Why this rule exists

Without it, every subsystem that wants persistent observability reinvents file-JSONL writes locally and the architecture allows two paths to drift (different formats, different env vars, different forensic queries). The bg-recall + injection-envelope drift was discovered post-shipping and required a separate refactor bead (km-bearly.unified-observability) to fold them back into loggily. The rule above turns "two paths can drift" into "there is no second path" — quality-rubric L0/L1 → L4.

## Sub-skills

| File                                   | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| [debug.md](debug.md)                   | `DEBUG=ns:*` namespace patterns, TUI debugging     |
| [logger.md](logger.md)                 | loggily levels, namespace conventions deep-dive    |
| [worker-threads.md](worker-threads.md) | Worker thread debug forwarding pattern             |

## Lint

`bash packages/km-infra/scripts/check-no-raw-logging.sh` — fails CI if it finds:

  - `fs.appendFileSync(...)` to `.log` / `.jsonl` paths in source (test fixtures + back-compat shims allow-listed)
  - Local `createLogger` function exports outside `vendor/loggily/`

## Reference

  - `vendor/loggily/src/{core,file-writer,pipeline}.ts` — primitive
  - `vendor/loggily/README.md` — full API + recipes
  - `hub/composition.md` — loggily is the 5th runtime-stack pattern (alongside composition, TEA, signals, scope)
  - `docs/principles.md#observability-via-loggily` — the principle entry

# Loggily v2 API Design

Status: v2.4 Final
Date: 2026-04-12

## One-sentence pitch

One import. Objects configure. Arrays branch. Values write.

## Design philosophy

**Composable primitives, ergonomic API on top.** No globals. Everything is a function or data. Config is declarative (objects in arrays), power users compose.

## Core API

```ts
import { createLogger } from "loggily"

// Zero config (env vars: LOG_LEVEL, DEBUG, LOG_FORMAT)
const log = createLogger("myapp")

// Configured
const log = createLogger("myapp", [
  { level: "debug", ns: "-sql" },
  console,
  { file: "/tmp/app.log", level: "info", format: "json" },
  { file: "/tmp/errors.log", level: "error", format: "json" },
])

log.info?.("server started", { port: 3000 })
```

`createLogger(name, config?)` is always sync. Does NOT accept Promises.

## Discrimination rules

In the config array, each element is classified by type:

1. **Array** → branch (fanout with own config scope)
2. **`console` literal or `"console"` string** → console sink (special-cased)
3. **Function** → custom stage `(event) => event | null | void`
4. **Node writable / FileHandle / `{ write }` (non-POJO)** → writable sink
5. **POJO** → scope config OR output descriptor (see below)
6. **Anything else** → error (descriptive message)

**POJO check**: `Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null`

### POJO discrimination (scope config vs output descriptor)

- Has `file` key → **output descriptor** (creates file sink with local config)
- Has `otel` key → **output descriptor** (creates OTEL sink, Phase 4)
- Has ONLY config keys (`level`, `ns`, `format`, `spans`) → **scope config** (applies to subsequent siblings)
- Has both config keys AND sink key → **output descriptor** with local overrides
- Has unknown keys → **error** (fail early with descriptive message)

### Reject at creation time

```ts
{ write, level: "info" }         // sink + config mixed — ambiguous
{ file: "a.log", otel: {...} }   // two sink keys
{ foo: 123 }                     // unknown config key
```

Fail early, never silently guess.

## Types

```ts
type OutputLogLevel = "trace" | "debug" | "info" | "warn" | "error"
type LogLevel = OutputLogLevel | "silent"
type LogFormat = "console" | "json"

type LogEvent = {
  kind: "log"
  time: number
  namespace: string
  level: OutputLogLevel
  message: string
  props?: Record<string, unknown>
}

type SpanEvent = {
  kind: "span"
  time: number
  namespace: string
  name: string
  duration: number
  props?: Record<string, unknown>
  spanId: string
  traceId: string
  parentId: string | null
}

type Event = LogEvent | SpanEvent

// Stages are synchronous transforms/filters only.
// Async work belongs in sinks. Middleware-style before/after belongs in plugins.
type Stage = (event: Event) => Event | null | void
```

## Config object fields

| Field    | Type                 | Scope config                    | Output descriptor                |
| -------- | -------------------- | ------------------------------- | -------------------------------- |
| `level`  | `LogLevel`           | min level for scope             | min level for this output        |
| `ns`     | `string \| string[]` | namespace filter (DEBUG syntax) | namespace filter for this output |
| `format` | `LogFormat`          | default format for outputs      | format for this output           |
| `spans`  | `boolean`            | enable/disable span output      | —                                |
| `file`   | `string`             | —                               | creates file sink                |
| `otel`   | `OtelConfig`         | —                               | creates OTEL sink (Phase 4)      |

`format` is a compile-time output option, not a runtime stage.

## Pipeline semantics

### Scope config cascades to siblings

```ts
createLogger("myapp", [
  { level: "debug", ns: "-sql" }, // scope: applies to everything below
  console, // uses scope level=debug, ns=-sql
  { file: "/tmp/app.log", level: "info", format: "json" }, // overrides level to info
])
```

### Arrays are branches (fanout)

Each branch gets its own config scope:

```ts
createLogger("myapp", [
  { level: "debug" },
  console, // gets everything at debug+
  [{ level: "error" }, { file: "/tmp/err.log" }], // branch: only errors
])
```

### Custom stages

Functions are synchronous transforms/filters:

```ts
createLogger("myapp", [
  (e) => ({ ...e, props: { ...e.props, host: hostname() } }), // enrich
  (e) => (e.props?.audit ? e : null), // filter (null = drop)
  console,
])
```

## Logger interface

```ts
interface ConditionalLogger {
  readonly name: string
  readonly props: Readonly<Record<string, unknown>>

  trace?: (msg: LazyMessage, data?: Record<string, unknown>) => void
  debug?: (msg: LazyMessage, data?: Record<string, unknown>) => void
  info?: (msg: LazyMessage, data?: Record<string, unknown>) => void
  warn?: (msg: LazyMessage, data?: Record<string, unknown>) => void
  error?: {
    (msg: LazyMessage, data?: Record<string, unknown>): void
    (error: Error, data?: Record<string, unknown>): void
    (error: Error, msg: string, data?: Record<string, unknown>): void
  }

  /** @deprecated Use .child() */
  logger(namespace?: string, props?: Record<string, unknown>): ConditionalLogger
  span(namespace?: string, props?: LazyProps): SpanLogger
  child(namespace: string, props?: Record<string, unknown>): ConditionalLogger
  child(context: Record<string, unknown>): ConditionalLogger
  end(): void
}
```

Methods are `undefined` when disabled by level. `log.debug?.()` does zero work.
Auto-detect arg order: `log.error(err, "msg")` and `log.error("msg", props)` both work.

## Child loggers and shared config

Children share the parent's pipeline:

```ts
const root = createLogger("myapp", [console])
const child = root.child("auth") // namespace: "myapp:auth"
const grand = child.child("login") // namespace: "myapp:auth:login"
```

`.child()` is the unified method:
- `.child("auth")` — extend namespace
- `.child({ requestId: "abc" })` — add context fields
- `.child("auth", { sso: true })` — both

`.logger()` still works but is deprecated.

### Shared config across modules

```ts
// app/logger.ts
export const log = createLogger("myapp", [
  { level: "debug", ns: "-sql" },
  console,
  { file: "/var/log/myapp.log", level: "info", format: "json" },
])

// app/auth.ts
import { log } from "./logger.ts"
const authLog = log.child("auth")
authLog.info?.("login attempted", { user: "alice" })
```

## Environment variables (defaults)

When `createLogger("name")` is called with no config array:

| Variable     | Effect                                                  |
| ------------ | ------------------------------------------------------- |
| `LOG_LEVEL`  | minimum level (default: `info`)                         |
| `DEBUG`      | namespace filter (DEBUG package syntax)                 |
| `LOG_FORMAT` | `console` or `json` (default: auto-detect)              |
| `NODE_ENV`   | `production` → JSON format                              |
| `NO_COLOR`   | disable ANSI colors                                     |
| `TRACE`      | `1`, `true`, or namespace prefixes — enable span output |

## Logger composition

```ts
import { createLogger, pipe, withEnvDefaults } from "loggily"

// createLogger already includes withEnvDefaults()
// Pipe with custom plugins:
const myCreateLogger = pipe(createLogger, withSentry({ dsn: "..." }))
```

`pipe(base, ...plugins)` chains `LoggerPlugin` functions left-to-right. Each plugin wraps the factory:

```ts
type LoggerFactory = (name: string, configOrProps?: unknown[] | Record<string, unknown>) => ConditionalLogger
type LoggerPlugin = (factory: LoggerFactory) => LoggerFactory
```

`withEnvDefaults()` is the built-in plugin that reads `LOG_LEVEL`, `DEBUG`, `LOG_FORMAT`, `TRACE`, `LOG_FILE` from env vars. It's included by default in `createLogger`. The internal `baseCreateLogger` (not exported) requires an explicit config array.

### createTestLogger

```ts
import { createTestLogger } from "loggily"
const log = createTestLogger("test") // all levels enabled, console output
```

### createLogger backwards compat

`createLogger(name, props)` accepts a non-array object as the second argument for backwards compatibility. It's treated as props (context fields), not a config array:

```ts
const log = createLogger("myapp", { service: "api" })
// equivalent to: createLogger("myapp").child({ service: "api" })
```

## Compatibility

- **DEBUG=** env var: same syntax as the `debug` npm package
- **Pino transports**: objects with `{ write(msg) }` work as sinks
- **`log.error(err, "msg")`**: Pino-style error call signature supported
- **`using` keyword**: spans implement `Symbol.dispose`

## Migration from v1

| v1 (global setter)          | v2 (config array)                                    |
| --------------------------- | ---------------------------------------------------- |
| `setLogLevel("debug")`      | `createLogger("x", [{ level: "debug" }, console])`   |
| `setDebugFilter(["myapp"])` | `createLogger("x", [{ ns: "myapp" }, console])`      |
| `setLogFormat("json")`      | `createLogger("x", [{ format: "json" }, console])`   |
| `enableSpans()`             | `TRACE=1` env var (unchanged)                        |
| `addWriter(w)`              | `createLogger("x", [console, w])`                    |
| `createFileWriter(path)`    | `createLogger("x", [{ file: path }])`                |
| `setSuppressConsole(true)`  | `createLogger("x", [{ file: path }])` (omit console) |
| `setOutputMode("stderr")`   | pass `process.stderr` in config array                |

## Decisions

- `createLogger()` is sync-only — no Promise inputs
- `log.info?.()` stays — it's the selling point
- No `formatted` field on Event — sinks format internally
- `ns` for namespace filters (not `name` — avoids ambiguity with logger name)
- No `filter()`, `byLevel()`, `byNamespace()`, `toFile()` imports for common cases — config objects replace them
- `pipe()` is internal only — arrays replace it for users
- `pipe()` is separate from pipeline (different job: logger capabilities vs data routing)
- Config loading NOT in loggily — future `@silvery/config`
- CLI integration NOT in loggily — future `@silvery/commander`
- Positioning: state what loggily does and what it's compatible with, don't compare against others

## Ship plan

### Phase 1: Core pipeline + createLogger (P1)

- New types: LogEvent, SpanEvent, Stage
- Pipeline builder (discrimination, config parsing, dispatch)
- createLogger(name, config?) with array support
- Default pipeline from env vars
- Remove global setters from public API
- Update tests

### Phase 2: Logger decomposition + pipe() (P2)

- pipe() function for logger plugin composition
- Extract withSpans, withMetrics, withContext as plugins
- Default export = pre-composed with all standard plugins
- TypeScript intersection types for plugin config fields

### Phase 3: Deprecate v1 globals + migrate km (P2)

- Delete all global setter exports
- Migrate all km consumers
- Update all km tests

### Phase 4: Advanced features + docs (P3)

- OTEL bridge (loggily/otel)
- Worker forwarding v2 (loggily/worker)
- File rotation (loggily/rotation)
- Metrics in default compose
- Systematic update of ALL loggily docs (README, guide, API reference, VitePress)

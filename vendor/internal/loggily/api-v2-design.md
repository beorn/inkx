# Loggily v2 API Design

Status: Draft v2 (post-discussion)
Date: 2026-04-12

## Design philosophy

**Composable primitives, ergonomic API on top.** No god object. Everything is a function. Use what JS devs already know — `pipe()`, `filter`, plain values, `using` for resources.

## Three principles

1. **The Logger is tiny.** It just emits records. Capabilities (spans, metrics, context, workers) are plugins composed onto the Logger via `pipe()`.

2. **The pipeline is just JavaScript.** `pipe(console, openFile, myCustomFn)` works because pipe() coerces anything that quacks like a sink — no special wrapper types required.

3. **Lifecycle is `using`.** Resources implement `Symbol.dispose` / `Symbol.asyncDispose`. The pipeline forwards them to the Logger so `await using log = await createLogger(...)` cleans up everything at scope exit.

## Two pipes — one primitive

`pipe()` is used at two layers, both composing functions:

1. **Pipeline pipe** (the data flow): `pipe(filter, withTimestamp, console, openFile)` — what records flow through, where they go
2. **Logger pipe** (the capabilities): `pipe(baseLogger, withSpans, withMetrics, withContext)` — what the logger can do

Same primitive, two layers. Both tree-shakeable.

## The README example

```ts
import { createLogger, pipe } from "loggily"
import { open } from "node:fs/promises"

await using log = await createLogger("myapp", pipe(console, open("/tmp/app.log")))

log.info?.("server started", { port: 3000 })
log.debug?.("cache hit", { key: "user:42" })
log.error?.(new Error("connection lost"))
```

Six lines of imports + config. Uses standard Node API for the file. The `using` declaration auto-closes the file at scope exit. Works in browser too (drop the file).

## Core types

```ts
type LogLevel = "trace" | "debug" | "info" | "warn" | "error"

type LogRecord = {
  kind: "log"
  time: number
  namespace: string
  level: LogLevel
  message: string
  props?: Record<string, unknown>
  span?: SpanContext // present when in an active span
  formatted?: string // set by formatter stages
}

type SpanRecord = {
  kind: "span"
  time: number // end time
  namespace: string
  name: string
  duration: number // ms
  props?: Record<string, unknown>
  span: SpanContext // required — IS the span
  formatted?: string
}

type Record = LogRecord | SpanRecord

type Stage = (record: Record, next?: (r: Record) => void) => void

type Logger = {
  name: string
  info?: (msg: string, props?: object) => void
  debug?: (msg: string, props?: object) => void
  warn?: (msg: string, props?: object) => void
  error?: (msg: string | Error, props?: object) => void
  trace?: (msg: string, props?: object) => void
  child: (nameOrProps: string | object) => Logger
  // span, metrics, currentSpan added by plugins
}
```

## Pipeline coercion (`pipe()`)

`pipe()` accepts any of these inputs and coerces them to Stages:

| Input                                    | Coerced to           | Notes                                                     |
| ---------------------------------------- | -------------------- | --------------------------------------------------------- |
| `Stage` (function with arity 2)          | passthrough          | already in shape                                          |
| `(record) => void` (arity 1)             | terminal sink        | wraps; doesn't call next                                  |
| `console`                                | special-cased        | uses `console[level](msg, props)` for DevTools            |
| `{ write: (s: string) => any }`          | terminal sink        | streams, FileHandles, FileSinks, anything with `.write()` |
| `Promise<T>`                             | await + recurse      | resolved value goes through asStage                       |
| `T & Disposable` / `T & AsyncDisposable` | register for cleanup | in addition to other coercion                             |
| anything else                            | **throws**           | with helpful message                                      |

```ts
function pipe(...inputs: PipeInput[]): Promise<Stage & AsyncDisposable> | (Stage & AsyncDisposable)
```

If any input is a Promise, pipe() returns a Promise. Otherwise sync.

## Lifecycle: `using` and `Symbol.asyncDispose`

Resources in the pipeline that have `[Symbol.dispose]` or `[Symbol.asyncDispose]` are collected and called in LIFO order when the Logger is disposed:

```ts
{
  await using log = await createLogger(
    "myapp",
    pipe(
      console,
      open("/tmp/app.log"), // FileHandle has [Symbol.asyncDispose]
      open("/tmp/errors.log"),
    ),
  )

  log.info?.("hello")
} // log dispose → file 2 close → file 1 close
```

## Fanout with different config

Three ways, all functionally equivalent:

### A. Factory functions (most ergonomic)

```ts
import { createLogger, pipe, filter } from "loggily"
import toConsole from "loggily/console"
import toFile from "loggily/file"
import toOtel from "loggily/otel"

const log = createLogger(
  "myapp",
  pipe(
    filter("-myapp:sql"), // shared
    toConsole({ level: "debug" }),
    toFile("/tmp/app.log", { level: "info", format: "json" }),
    toFile("/tmp/errors.log", { level: "error", format: "json" }),
    toOtel({ endpoint, filter: /^auth/ }),
  ),
)
```

### B. Nested pipes (explicit)

```ts
import { createLogger, pipe, filter, byLevel, byNamespace, jsonFormat } from "loggily"
import { open } from "node:fs/promises"

await using log = await createLogger(
  "myapp",
  pipe(
    filter("-myapp:sql"), // shared
    pipe(byLevel("debug"), console), // sub-pipe
    pipe(byLevel("info"), jsonFormat, open("/tmp/app.log")),
    pipe(byLevel("error"), jsonFormat, open("/tmp/errors.log")),
    pipe(byNamespace([/^auth/]), toOtel({ endpoint })),
  ),
)
```

### C. Raw primitives (default config only)

```ts
const log = createLogger("myapp", pipe(filter("-myapp:sql"), console, openFile))
```

The factory style sugars to the nested-pipe style internally. Both compile to the same Stage.

## Filters

`filter()` accepts string, regex, array of those, or a custom predicate function:

```ts
type FilterPattern = string | RegExp
type FilterValue =
  | FilterPattern // single
  | FilterPattern[] // array
  | ((record: Record) => boolean) // custom predicate

function filter(value: FilterValue): Stage
```

```ts
filter("myapp:*")
filter(/^auth/)
filter(["myapp:*", "-myapp:sql"]) // DEBUG syntax with - exclusion
filter([/^auth/, "db:*", "-db:debug"])
filter((r) => r.props?.audit === true) // custom
filter((r) => r.kind === "log" && r.level === "error")
```

DEBUG-syntax patterns (`*` glob, `-` prefix exclusion) are preserved from v1.

## Plugins (capabilities for the Logger)

Plugins are `(createLogger) => createLogger` functions that add methods to the returned Logger. They're composed via the same `pipe()`:

```ts
import { baseLogger, pipe } from "loggily"
import withSpans from "loggily/spans"
import withMetrics from "loggily/metrics"
import withContext from "loggily/context"

// Build YOUR createLogger with the capabilities you want
const createLogger = pipe(
  baseLogger,
  withSpans, // adds .span(name)
  withMetrics(), // adds .metrics
  withContext, // adds .currentSpan(), AsyncLocalStorage tracking
)
// Type: (name, pipeline) => Logger & WithSpans & WithMetrics & WithContext
```

The default `loggily` export is a pre-composed `createLogger` with all standard plugins. Users who care about bundle size build their own:

```ts
// Minimal: only spans, no metrics or context
const createLogger = pipe(baseLogger, withSpans)
```

## Plugin reference

| Plugin             | Adds                                             | Module            |
| ------------------ | ------------------------------------------------ | ----------------- |
| `baseLogger`       | `info/debug/warn/error/trace`, `child`           | `loggily` (core)  |
| `withSpans`        | `span(name, props?)`, `SpanLogger`, span context | `loggily/spans`   |
| `withMetrics()`    | `metrics` collector, declarative metrics         | `loggily/metrics` |
| `withContext`      | `currentSpan()`, AsyncLocalStorage tracking      | `loggily/context` |
| `withWorker(port)` | worker thread forwarding (worker side)           | `loggily/worker`  |

## Sinks and formatters (subpath modules)

Each sink lives in its own subpath. Third parties can ship their own.

| Module             | Exports                    | Notes                                      |
| ------------------ | -------------------------- | ------------------------------------------ |
| `loggily/console`  | `toConsole(opts?)`         | colorized text, uses `console[level]()`    |
| `loggily/file`     | `toFile(path, opts?)`      | buffered async, lifecycle via process exit |
| `loggily/otel`     | `toOtel(opts)`             | OTLP logs+spans+metrics signal export      |
| `loggily/rotation` | `rotatingFile(path, opts)` | size/time-based rotation, gzip, retention  |
| `loggily/worker`   | `toWorker(port)`           | forward records to a worker channel        |

Format helpers:

| Helper                    | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `consoleFormat` (default) | colorized text with timestamps                |
| `jsonFormat`              | structured JSON, one line per record          |
| `customFormat(fn)`        | `(record) => string` for custom serialization |

## Stage helpers

| Helper                  | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `filter(value)`         | gate by namespace/level/predicate                            |
| `byLevel(level)`        | gate by minimum level                                        |
| `byNamespace(patterns)` | gate by namespace patterns (DEBUG syntax + regex)            |
| `byPredicate(fn)`       | gate by custom function                                      |
| `withTimestamp`         | enrich record with timestamp                                 |
| `withTraceContext`      | enrich record with trace/span IDs from ALS                   |
| `withProps(props)`      | enrich record with static props                              |
| `consoleFormat`         | format → colorized text (sets `record.formatted`)            |
| `jsonFormat`            | format → JSON string (sets `record.formatted`)               |
| `asStage(input)`        | explicit coercion (rarely needed; thrown errors are clearer) |

## Metrics

Metrics are derived (via stream tap) or recorded directly. Declared upfront:

```ts
import { createMetrics, counter, gauge, histogram } from "loggily/metrics"

const metrics = createMetrics({
  // Derived from the record stream
  errorsTotal: counter({ when: (r) => r.level === "error" }),
  requestDuration: histogram({
    when: (r) => r.kind === "span" && r.name === "http-request",
    value: (r) => r.duration,
    labels: (r) => ({ status: r.props?.status }),
  }),

  // Direct recording (no `when`)
  connectionsActive: gauge(),
  requestBytes: histogram(),
})

const log = createLogger(
  "myapp",
  pipe(
    metrics.stage(), // taps the stream for derived metrics
    console,
  ),
)

// Direct recording
metrics.connectionsActive.set(42)
metrics.requestBytes.observe(1234, { endpoint: "/api" })

// Query
metrics.requestDuration.percentiles() // { count, p50, p95, p99, mean }
metrics.errorsTotal.value()
metrics.summary() // formatted text
```

Metrics export:

- `loggily/prometheus` — pull-based HTTP endpoint
- `loggily/otel-metrics` — push-based OTLP

## Children and namespace inheritance

```ts
const root = createLogger("myapp", pipe(...))
const child = root.child("auth")        // namespace: "myapp:auth"
const grand = child.child("login")      // namespace: "myapp:auth:login"
```

Children share the parent's pipeline. Namespace concatenates with `:`.

## Shared config across modules

Three patterns, depending on how dynamic you want the config to be.

### Pattern A: Env vars only (zero-config, simplest)

```ts
// auth.ts
import { createLogger } from "loggily"
const log = createLogger("myapp:auth")
```

```ts
// db.ts
import { createLogger } from "loggily"
const log = createLogger("myapp:db")
```

`createLogger("name")` with no pipeline arg uses a **default pipeline** built from env vars. Each module imports loggily directly. No shared module needed.

Supported env vars (read at module load):

| Variable     | Effect                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`  | minimum level: `trace`, `debug`, `info`, `warn`, `error` (default: `info`)                      |
| `DEBUG`      | namespace filter — same syntax as the `debug` package: `myapp:*`, `-myapp:sql`, comma-separated |
| `LOG_FORMAT` | `console` or `json` (default: `json` if `NODE_ENV=production`, else `console`)                  |
| `LOG_FILE`   | additional file output path; opens with `toFile()` factory                                      |
| `NO_COLOR`   | disables colors in console format                                                               |
| `NODE_ENV`   | `production` → JSON format default                                                              |

The default pipeline is roughly:

```ts
function defaultPipeline(): Stage {
  const stages: Stage[] = []
  if (process.env.DEBUG) stages.push(filter(parseDebugSyntax(process.env.DEBUG)))
  if (process.env.LOG_LEVEL) stages.push(byLevel(process.env.LOG_LEVEL))

  const useJson = process.env.LOG_FORMAT === "json" || process.env.NODE_ENV === "production"
  stages.push(useJson ? jsonFormat : consoleFormat)

  stages.push(console) // always log to console
  if (process.env.LOG_FILE) stages.push(toFile(process.env.LOG_FILE))

  return pipe(...stages)
}
```

Override at runtime:

```bash
LOG_LEVEL=debug DEBUG=myapp:* node app.js
LOG_FORMAT=json LOG_FILE=/var/log/myapp.log node app.js
DEBUG='myapp:*,-myapp:sql' node app.js
```

This is the **Pino/debug experience**: import and go, env vars do the rest.

### Pattern B: Shared module with explicit pipeline (most flexible)

For apps that need things env vars can't express (per-output levels, OTEL endpoints, custom enrichers, etc.), share a configured factory through a module:

```ts
// app/logger.ts — your app's shared logger setup
import { createLogger as loggilyCreate, pipe, filter } from "loggily"
import toConsole from "loggily/console"
import toFile from "loggily/file"
import toOtel from "loggily/otel"

// Define the pipeline once
const pipeline = pipe(
  filter("-myapp:sql"),
  toConsole({ level: "debug" }),
  toFile("/var/log/myapp.log", { level: "info", format: "json" }),
  toFile("/var/log/myapp.error", { level: "error", format: "json" }),
  toOtel({ endpoint: process.env.OTEL_ENDPOINT, filter: /^auth/ }),
)

// Export a configured factory
export const createLogger = (name: string) => loggilyCreate(name, pipeline)
```

```ts
// app/auth.ts
import { createLogger } from "./logger"
const log = createLogger("myapp:auth")
log.info?.("login attempted", { user: "alice" })
```

```ts
// app/db.ts
import { createLogger } from "./logger"
const log = createLogger("myapp:db")
log.debug?.("query", { sql: "SELECT * FROM users" })
```

The shared module:

- Defines the pipeline once at module load
- Exports a `createLogger` function that closes over it
- Modules import that `createLogger` and get a logger that uses the shared pipeline

**This works because**:

- `pipe()` is sync when no inputs are promises (`toFile` is sync — opens file lazily on first write)
- `loggilyCreate(name, pipeline)` is sync — just wraps the pipeline with a Logger
- All modules share the same pipeline instance — one set of files, one OTLP exporter

### Pattern C: Shared module + env var overrides (hybrid)

Mix the two — code defaults, env vars override:

```ts
// app/logger.ts
import { createLogger as loggilyCreate, pipe, filter } from "loggily"
import toConsole from "loggily/console"
import toFile from "loggily/file"

const level = process.env.LOG_LEVEL ?? "debug"
const file = process.env.LOG_FILE ?? "/var/log/myapp.log"
const dbg = process.env.DEBUG ?? "myapp:*,-myapp:sql"

const pipeline = pipe(filter(dbg), toConsole({ level }), toFile(file, { level: "info", format: "json" }))

export const createLogger = (name: string) => loggilyCreate(name, pipeline)
```

Now you get the best of both: code-defined pipeline structure with env-var-tunable parameters. Production tweaks (raise log level, redirect file, etc.) without code changes.

### Pattern D: Async shared module (using `await using` for explicit lifetime)

For long-running apps that want explicit `Symbol.asyncDispose` lifecycle (e.g., test suites, scripts, controlled shutdown):

```ts
// app/logger.ts
import { createLogger as loggilyCreate, pipe } from "loggily"
import { open } from "node:fs/promises"

// Top-level await opens the file at module load
const file = await open("/var/log/myapp.log", "a")
const pipeline = pipe(console, file)

export const createLogger = (name: string) => loggilyCreate(name, pipeline)

// Optional: expose a shutdown for graceful exit
export async function closeLoggers() {
  await file[Symbol.asyncDispose]()
}
```

```ts
// main.ts
import { createLogger, closeLoggers } from "./logger"
import { auth } from "./auth"

const log = createLogger("myapp")
try {
  await auth.run()
} finally {
  await closeLoggers()
}
```

Or even cleaner — make the whole app run inside `await using`:

```ts
// main.ts
import { createLogger, pipe } from "loggily"
import { open } from "node:fs/promises"

async function main() {
  await using log = await createLogger("myapp", pipe(console, open("/var/log/myapp.log")))

  // ... entire app runs here ...
} // log + file disposed at scope exit

main()
```

### Choosing a pattern

| Use case                        | Pattern                      | Why                                      |
| ------------------------------- | ---------------------------- | ---------------------------------------- |
| Library or small script         | A (env vars)                 | Zero ceremony, just import and go        |
| Medium app with explicit setup  | B (shared module + `toFile`) | Sync, simple, all config in one file     |
| App with prod tunables          | C (shared + env)             | Tweak in deployment without code changes |
| Test suites, controlled scripts | D (top-level `await using`)  | Explicit cleanup at scope exit           |

### App-wide defaults compose with logger plugins

You can build YOUR createLogger with custom plugins AND share it:

```ts
// app/logger.ts — custom build with extra capabilities
import { baseLogger, pipe } from "loggily"
import withSpans from "loggily/spans"
import withMetrics from "loggily/metrics"
import withContext from "loggily/context"
import withSentry from "@sentry/loggily" // third-party plugin
import toConsole from "loggily/console"

const myCreateLogger = pipe(
  baseLogger,
  withSpans,
  withMetrics(),
  withContext,
  withSentry({ dsn: process.env.SENTRY_DSN }),
)

const pipeline = pipe(toConsole({ level: "debug" }))

export const createLogger = (name: string) => myCreateLogger(name, pipeline)
```

Now every logger in your app has spans, metrics, context, AND Sentry breadcrumbs — composed once, used everywhere.

## Config loading is delegated to `@silvery/config`

> **Status note**: `@silvery/config` does not exist yet. Creating it is a prerequisite for the loggily v2 cosmiconfig story. See the "Prerequisite work" section at the bottom for the spec.

Loggily core does not depend on cosmiconfig or any config loader. Instead, users use `@silvery/config` (a generic 12-factor config loader) and feed the result into `createLogger` via `fromConfig`.

This keeps the dependency DAG clean:

```
                            user app
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
       @silvery/commander                       loggily
              │                                   │
              ├──────────────────┐                │
              │                  │                │
       @silvery/config         loggily      loggily/console
              │                              loggily/file
              │                              loggily/otel
       cosmiconfig (peer)                    loggily/spans
                                             loggily/metrics
                                             ...
```

- **loggily** depends on nothing — pure logging library
- **@silvery/config** depends only on cosmiconfig (peer) — generic config loader
- **@silvery/commander** depends on both, wires them together for CLI apps

### loggily exposes only the schema and compiler

```ts
// loggily core
export type LoggilyConfig = {
  level?: LogLevel
  format?: "console" | "json"
  filter?: FilterValue
  sinks?: SinkConfig[]
  spans?: boolean | { idFormat?: "simple" | "w3c"; sampleRate?: number }
  metrics?: boolean | MetricsConfig
  context?: boolean
  pipeline?: Stage // power-user override
}

export type SinkConfig =
  | { type: "console"; level?: LogLevel; format?: "console" | "json"; filter?: FilterValue }
  | { type: "file"; path: string; level?: LogLevel; format?: "console" | "json"; filter?: FilterValue }
  | { type: "otel"; endpoint: string; level?: LogLevel; filter?: FilterValue; headers?: Record<string, string> }
  | { type: "rotation"; path: string; size?: string; interval?: string; keep?: number; compress?: boolean }

// fromConfig is the compiler — config object → Stage
export function fromConfig(config: LoggilyConfig): Stage
```

That's it. No `loadConfig`, no `loggily/config` subpath. Config is data; loggily compiles it.

### Polymorphic createLogger accepts the config directly

```ts
// All four work:
createLogger("myapp")                              // env vars, default sinks
createLogger("myapp", { sinks: [...] })            // config object
createLogger("myapp", pipe(...))                   // raw pipeline
await createLogger("myapp", loadConfig())          // promise of config OR pipeline
```

`createLogger` discriminates by type:

- function with arity 2 → Stage, use directly
- object with `sinks`/`level`/etc → LoggilyConfig, call `fromConfig` internally
- Promise → await, then discriminate
- undefined → defaultPipeline() from env vars

### Using @silvery/config with loggily

```ts
import { createLogger } from "loggily"
import { loadConfig } from "@silvery/config"

const config = await loadConfig({
  name: "loggily", // search for loggily.config.{yaml,js,...}
  envPrefix: "LOG_", // map LOG_LEVEL → level, LOG_FORMAT → format, etc.
})

const log = createLogger("myapp", config)
```

`@silvery/config.loadConfig` does:

1. Cosmiconfig search for `loggily.config.*`
2. Env var mapping (with `${VAR}` interpolation in the file)
3. Schema validation (optional)
4. Returns the validated, merged config object

Then `createLogger` handles compilation via `fromConfig` internally.

### Why @silvery/config exists separately

`@silvery/config` is generic — not loggily-specific. Any app that needs 12-factor config loading uses it:

```ts
// Database config
const dbConfig = await loadConfig<DbConfig>({ name: "mydb", envPrefix: "DB_" })

// Feature flags
const flags = await loadConfig<Flags>({ name: "myapp-flags" })

// Loggily config
const logConfig = await loadConfig<LoggilyConfig>({ name: "loggily", envPrefix: "LOG_" })
```

One config loader, many consumers. The merge precedence (defaults < file < env < override) is implemented once.

### Power-user JS config files still work

For users who want full programmatic power, `loggily.config.js` can export a fully-built Stage in the `pipeline` field:

```js
// loggily.config.js
import { pipe, filter } from "loggily"
import toConsole from "loggily/console"

export default {
  level: "info",
  format: "json",

  // Override hatch — gets full pipe() power
  pipeline: pipe(
    filter("-myapp:sql"),
    (record, next) => {
      record.host = require("os").hostname()
      next(record)
    },
    toConsole({ level: "debug" }),
  ),
}
```

`fromConfig()` checks `config.pipeline` first; if set, uses it directly, ignoring `sinks`/etc.

### CLI integration via @silvery/commander

Loggily has no CLI integration code. `@silvery/commander` provides `withLogging`, which wires `@silvery/config` and `loggily` together for CLI apps:

```ts
// @silvery/commander/with-logging.ts (sketch)
import { loadConfig } from "@silvery/config"
import { createLogger, type LoggilyConfig } from "loggily"

export const withLogging = (cmd) =>
  cmd
    .option("-l, --log-level <level>", "log level (trace|debug|info|warn|error)")
    .option("-d, --debug [pattern]", "debug filter (DEBUG syntax)")
    .option("-q, --quiet", "warn-only")
    .option("-v, --verbose", "verbose (-vv = debug, -vvv = trace)", increaseVerbosity, 0)
    .option("--log-format <format>", "console or json")
    .option("--log-file <path>", "additional file output")
    .option("--no-color", "disable ANSI colors")
    .hook("preAction", async (ctx) => {
      const config = await loadConfig<LoggilyConfig>({
        name: "loggily",
        envPrefix: "LOG_",
        override: argsToConfig(ctx.args),
      })
      ctx.createLogger = (name) => createLogger(name, config)
      ctx.log = ctx.createLogger(ctx.commandPath)
    })
```

CLI authors get logging for free with one `.use(withLogging)`:

```ts
import { commander, withLogging } from "@silvery/commander"

const app = commander("myapp")
  .use(withLogging)
  .command("serve")
  .option("-p, --port <n>", "port", 3000)
  .action(async (args, ctx) => {
    ctx.log.info?.("server starting", { port: args.port })
    const dbLog = ctx.createLogger("myapp:db")
    dbLog.debug?.("connecting")
  })

app.run()
```

```bash
$ myapp serve --log-level debug
$ myapp serve -vv --debug 'myapp:*,-myapp:sql'
$ NODE_ENV=production myapp serve --log-format json --log-file /var/log/myapp.log
```

Standard verbosity flags (`-v`, `-vv`, `-vvv`) match ripgrep, ffmpeg, kubectl, gh, terraform.

### Example: a config file used by both @silvery/config and loggily

`@silvery/config` searches for `loggily.config.{yaml,json,js,...}` via cosmiconfig and returns the parsed object. `createLogger("myapp", config)` then compiles it.

```yaml
# loggily.config.yaml
level: ${LOG_LEVEL:-info}
filter: ${DEBUG:-myapp:*}
sinks:
  - type: console
    level: debug
  - type: file
    path: ${LOG_FILE:-/var/log/myapp.log}
    level: info
    format: json
  - type: file
    path: /var/log/myapp.error
    level: error
    format: json
  - type: otel
    endpoint: ${OTEL_ENDPOINT}
    filter: "/^auth/"
```

`@silvery/config` handles the `${VAR}` interpolation. Loggily just sees the resolved object.

### Pattern E: @silvery/config + @silvery/commander (full prod story)

```ts
// app/logger.ts — works for both CLI and non-CLI modules
import { createLogger as loggilyCreate, type LoggilyConfig } from "loggily"
import { loadConfig } from "@silvery/config"

let cached: LoggilyConfig | null = null

export async function setup(override?: Partial<LoggilyConfig>) {
  cached ??= await loadConfig<LoggilyConfig>({
    name: "loggily",
    envPrefix: "LOG_",
    override,
  })
  return (name: string) => loggilyCreate(name, cached!)
}
```

```ts
// CLI entry — uses commander's withLogging which calls setup internally
import { commander, withLogging } from "@silvery/commander"

commander("myapp")
  .use(withLogging)
  .command("serve")
  .action(async (args, ctx) => {
    ctx.log.info?.("starting")
  })
  .run()
```

```ts
// Non-CLI module (e.g., a worker) — uses setup() directly
import { setup } from "./logger"
const createLogger = await setup()
const log = createLogger("worker")
```

Both call paths use the same `@silvery/config` loader, the same `loggily.config.yaml`, the same env vars. Single source of truth, accessed via the appropriate framework.

## Helpers we'll need to ship

### Core (`loggily`)

- `createLogger(name, source?)` — polymorphic: accepts Stage, LoggilyConfig, or Promise of either
- `baseLogger` — minimal logger factory (the bottom of the plugin pipe)
- `pipe(...inputs)` — composition primitive (sync OR async based on inputs)
- `fromConfig(config)` — compile LoggilyConfig object → Stage
- `fromEnv()` — build partial LoggilyConfig from env vars (LOG_LEVEL, DEBUG, etc.)
- `asStage(input)` — explicit coercion (escape hatch)
- `filter(value)` — universal filter (string, regex, array, function)
- `byLevel(level)`, `byNamespace(patterns)`, `byPredicate(fn)` — specialized filters
- `withTimestamp`, `withTraceContext`, `withProps(props)` — enrichers
- `consoleFormat`, `jsonFormat`, `customFormat(fn)` — formatters
- Types: `LoggilyConfig`, `SinkConfig`, `Stage`, `LogRecord`, `SpanRecord`, `Record`, `Logger`, `FilterValue`

### Plugins (subpath modules)

- `loggily/spans` → `withSpans` plugin (adds `.span()`)
- `loggily/metrics` → `withMetrics`, `createMetrics`, `counter`, `gauge`, `histogram`
- `loggily/context` → `withContext` plugin, `getCurrentSpan()`, `runInSpanContext()`
- `loggily/worker` → `withWorker(port)` plugin, `toWorker(port)` sink

### Sinks (subpath modules)

- `loggily/console` → `toConsole(opts?)` (per-output level, format)
- `loggily/file` → `toFile(path, opts?)` (per-output level, format, lazy open)
- `loggily/otel` → `toOtel(opts)` (peer dep `@opentelemetry/api`)
- `loggily/rotation` → `rotatingFile(path, opts)` (size/time rotation, compression)
- `loggily/prometheus` → `toPrometheus({ metrics, port })` (metrics endpoint)

### NOT in loggily (belong elsewhere)

- Config loading (cosmiconfig, env interpolation, merge) → `@silvery/config`
- CLI flags (--log-level, -v, --debug, --no-color) → `@silvery/commander/with-logging`
- Config → args bridge (`fromArgs(parsedArgs)`) → `@silvery/commander`

## Prerequisite work

### `@silvery/config` — generic 12-factor config loader

> **Does not exist yet.** Must be created before loggily v2 can offer the config-file story.

```ts
// @silvery/config — minimal spec
export async function loadConfig<T>(opts: LoadOpts<T>): Promise<T>
export function mergeConfigs<T>(...configs: Partial<T>[]): T
export function interpolate<T>(config: T, env?: Record<string, string>): T

type LoadOpts<T> = {
  name: string // app name (for cosmiconfig search)
  defaults?: T // hardcoded fallback
  envPrefix?: string // env var prefix (e.g. "LOG_")
  envMap?: Record<string, keyof T> // map specific env vars to fields
  override?: Partial<T> // explicit overrides (e.g. from CLI)
  schema?: Schema<T> // optional validation (Zod, valibot, etc.)
  interpolate?: boolean // ${VAR} substitution in strings (default: true)
}
```

Features:

- Cosmiconfig search for `<name>.config.{yaml,json,js,ts,...}`
- `${VAR}` and `${VAR:-default}` interpolation in string values
- Fixed merge order: `defaults < file < env < override`
- Optional schema validation
- Peer dep: cosmiconfig ^9.0.0
- Small (~200 LOC), generic, reusable for any app's config

### `@silvery/commander/with-logging`

> **Extends existing @silvery/commander.** Add `withLogging` plugin and `argsToConfig()` helper.

Registers standard log flags (-v, --log-level, --debug, --quiet, --log-format, --log-file, --no-color) and provides `ctx.log`/`ctx.createLogger` to action handlers.

Peer deps: `loggily`, `@silvery/config`

## Migration from v1

| v1 (global setter)               | v2 (pipeline / plugin)                                        |
| -------------------------------- | ------------------------------------------------------------- |
| `setLogLevel("debug")`           | `pipe(byLevel("debug"), ...)` or factory `{ level: "debug" }` |
| `setDebugFilter(["myapp"])`      | `pipe(filter(["myapp"]), ...)`                                |
| `setLogFormat("json")`           | per-sink: `toFile(path, { format: "json" })`                  |
| `enableSpans()`                  | use `withSpans` plugin (default)                              |
| `setTraceFilter([...])`          | per-sink filter or `pipe(filter(...), toOtel(...))`           |
| `addWriter(w)`                   | `pipe(..., w)` — w is just a value with `.write()`            |
| `createFileWriter(path)`         | `await open(path)` (Node) or `Bun.file(path).writer()`        |
| `setIdFormat("w3c")`             | `withSpans({ idFormat: "w3c" })`                              |
| `setSampleRate(0.1)`             | `withSpans({ sampleRate: 0.1 })`                              |
| `enableContextPropagation()`     | use `withContext` plugin (default)                            |
| `addWriter(createFileWriter(p))` | `pipe(..., await open(p))` with `await using log`             |

## Decisions taken

- **Names**: `pipe`, `filter`, `console`, `file`, `otel` — universal JS vocabulary, no invented words like "through", "routes", "to.\*", "only", "except"
- **Filters use `filter`** — same word as `Array.filter`, RxJS, lodash; NOT `only`/`except`
- **Sinks are free functions in subpath modules** — extensible, tree-shakeable, no central registry
- **No `to.*` namespace** — closed namespaces prevent third-party sinks
- **Logger is decomposed via plugins** — no god object; default `createLogger` is just `pipe(baseLogger, with*)` of standard plugins
- **`using` for resource lifecycle** — not try/finally, not process.on(exit); aligns with km principles
- **Promises in pipe()** — pipe awaits internally, registers Disposables for cleanup, returns Promise<Stage>
- **Logs and spans share one stream** — `Record = LogRecord | SpanRecord`; metrics are subscribers, not records
- **createLogger is polymorphic** — accepts Stage, LoggilyConfig object, or Promise of either
- **Config loading is NOT in loggily** — belongs in `@silvery/config` (generic 12-factor loader)
- **CLI integration is NOT in loggily** — belongs in `@silvery/commander/withLogging`
- **Loggily exposes LoggilyConfig type + fromConfig() compiler** — the bridge between data and runtime
- **pipe() coerces any writable/callable/console** — `pipe(console, open(file))` works without wrapper functions

## Open questions

1. **`createLogger` overload**: sync when pipeline is sync, async when pipeline has promises? Or always async? Most users probably want the sync overload to feel familiar.

2. **`pipe()` ordering**: do non-terminal stages need to come before terminal stages? Or can they be interleaved (with implicit reordering at construction)? Keeping order strict is more predictable.

3. **Multiple terminals at one level**: `pipe(filter, console, file, otel)` — three terminals after one filter. Each gets a copy of the filtered records. Confirmed: this is fanout. The pipeline's "branches" are the terminal stages.

4. **Console format default**: when you `pipe(console)`, what format is used? Probably `consoleFormat()` automatically. When you `pipe(toConsole({ format: "json" }))`, JSON. Sensible.

5. **Stage helper subpath vs core**: should `byLevel`, `byNamespace`, `withTimestamp` live on `loggily` core or on `loggily/stages`? I lean core — they're tiny and almost everyone uses them.

6. **Async pipe inside sync pipe**: `pipe(console, pipe(open(file), filter))` — the inner pipe is async, the outer one would also need to await. This implies pipe is "infectiously async" once any input is a promise. That's fine but worth noting.

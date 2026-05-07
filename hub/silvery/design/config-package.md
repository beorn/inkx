---
mentions:
  - silvery
---

# `@silvery/config` — design

Bead: `km-silvery.config-package`

Generic config-tree + named-registry primitives for silvery apps. Three layers, one package: `Config` (multi-source YAML), `Registry<Kind>` (typed views), and reactive signals over both.

**Status (2026-04-26):** Shipped at `@silvery/config@0.21.0` — multi-source discovery, scoped writes, signals, and watch mode are all live. 83 tests passing. See [README.md](../../../vendor/silvery/packages/config/README.md) for the consumer-facing API; this doc captures the design rationale.

## Why

The "named, parameterized presets with string-or-object equivalence and a current/default" pattern shows up everywhere in silvery-flavored apps:

- silvercode `ai.acp` (agent connections), `ai.mcp` (MCP servers)
- km-tui AI features (summarization, autocomplete) — share creds with silvercode
- silvery `themes` registry (theme presets), keybinding bundles, layout presets
- future: web/canvas endpoint configs, db connections, OAuth providers

Building it once and reusing pays off after the second consumer. Two consumers exist on day one (silvercode `connections` + `mcp_servers`), which is the YAGNI gate for shipping the abstraction.

## Three layers

### Layer 1 — `Config`

Generic deep-key get/set/unset/list/save with multi-source discovery (global + project), atomic writes, file watching, and reactive signals. The git-config analog.

```ts
const config = await loadConfig({
  appName: "km",                     // resolves global + project files
  schema: KmSchema,                  // Zod, optional
  defaults: { ai: { acp: { default: null }, mcp: {} } },
  watch: true,                       // optional: reload + signals on external edits
})

config.get("ai.acp.default")                       // merged view (project overrides global)
config.set("ai.acp.default", "claude-work")        // → global (default scope)
config.set("layout", "wide", "local")              // → project (lazy-creates `.km/config.yaml`)
config.unset("ai.acp.legacy-claude")
config.list({ pattern: "ai.acp.*" })
config.has("ai.acp.codex")
await config.save()                                 // global by default
await config.save({ scope: "local" })               // project file

config.globalPath                                   // resolved global path
config.projectPath                                  // resolved project path (or null)
config.path                                         // project ?? global (for --edit)
config.onChange((path, oldVal, newVal) => ...)      // change notifications (post-save + watch)
config.unwatch()                                    // stop watching
```

Single-file mode (`loadConfig({ path })`) bypasses multi-source discovery and is intended for tests / one-off loads — the file is treated as the global source.

### Layer 2 — Reactive signals

`@silvery/signals`-backed `ReadSignal` views. alien-signals' value-equality on `computed` means dependents only re-fire on actual value changes — `set` + `save` with the same value is a no-op for observers.

```ts
const themeSignal = config.signal<string>("ui.theme")
const root = config.rootSignal()

const acp = config.registry("ai.acp", AcpKind)
acp.signalEntries()                                 // ReadSignal<RegistryEntry[]>
acp.signalDefault()                                 // ReadSignal<Connection | undefined>
acp.signalGet("claude-work")                        // ReadSignal<Connection | undefined>
```

Signals fire after `save()` (in-memory mutations stage; observers see them on save) and after watcher-triggered reloads. This matches the file-as-truth model: nobody sees a config change until it's persisted.

Useful standalone for: theme prefs, layout state, anything that's not a named-preset registry.

### Layer 3 — `Registry<Kind>`

Typed view over a sub-tree of the config, with string-projection, schema validation, and reserved-key handling.

```ts
const ConnectionKind = defineKind({
  name: "connection",
  schema: z.object({
    agent: z.string(),
    account: z.string().optional(),
    model: z.string().optional(),
    options: z.record(z.unknown()).optional(),
    label: z.string().optional(),
    color: z.string().optional(),
    mcp_servers: z.array(z.string()).optional(),
  }),
  pathField: "agent",                    // URI path-segment maps here
  reservedKeys: ["default"],             // can't be used as entry names
  coerce: { bare: "boolean", temp: "number", top_k: "number" },
})

const acp = config.registry("ai.acp", ConnectionKind)

acp.entries()                            // [{ name, value: Connection }, ...]
acp.get("claude-work")                   // → Connection (parsed from string or object)
acp.resolve("claude-work")               // accepts: label, string, or returns null if missing
acp.resolve("codex?model=gpt-5-mini")    // string form auto-detected (contains ? or =)
acp.format("claude-work")                // → "claude-code?account=...&bare" (lossy if metadata)
acp.default()                            // → "claude-work" (reads ai.acp.default)
acp.setDefault("codex")                  // shorthand for config.set("ai.acp.default", "codex")
acp.add("quick", "codex?model=gpt-5-mini")
acp.rm("legacy-claude")
acp.has("claude-work")
```

## Connection-string grammar

One canonical mapping between strings and objects. Round-trip is lossless when no metadata fields (label, color, etc.) are set.

### Form

```
[<scheme>://]<path>[?<key>=<value>&<key>=<value>...]
```

- **scheme** — optional. Default behavior is "use the kind's default transport". Explicit override only when needed: `spawn://`, `acp+http://`. Most strings have no scheme.
- **path** — sugar for the kind's `pathField`. `claude-code?...` is equivalent to `?agent=claude-code&...` (when `pathField: "agent"`).
- **query** — `&`-separated `key=value` pairs. `key` alone (no `=`) coerces to boolean true. `!key` coerces to false.

### Coercion rules (qs-style)

- `bare` → `true` (bare key)
- `!bare` → `false`
- `bare=1` / `bare=true` → `true`
- `bare=0` / `bare=false` → `false`
- `temp=0.7` → `0.7` (number; declared in `coerce`)
- `model=opus-4.7` → `"opus-4.7"` (string; default for unknown keys)
- `tools=read,edit` → `["read", "edit"]` (comma-array, configurable)
- `tools[]=read&tools[]=edit` → `["read", "edit"]` (bracket-array, also accepted)
- `mcp.km.cwd=/path` → `{ mcp: { km: { cwd: "/path" } } }` (dot-path nesting)

### Examples

```
claude-code?account=bjorn@stabell.org&bare
claude-code?account=work&model=opus-4.7&bare
codex
gemini?model=2.5-pro&temp=0.7
gemini?tools=read,edit&temp=0.7
spawn://claude-code?account=work&bare           # explicit transport override (rare)
```

### Why query, not userinfo

Userinfo (`work@host`) is reserved for credentials in URI semantics. Profile/account names that look like emails (`bjorn@stabell.org`) trigger escape hell in userinfo (`bjorn%40stabell.org@host`). Query params allow literal `@` without encoding, so `?account=bjorn@stabell.org` Just Works.

## String-or-object schema

Each registry entry is `oneOf: [string, object]`. Both forms validate against the same Zod schema after string parsing.

```yaml
ai:
  acp:
    # String form — terse one-liners
    claude-work: "claude-code?account=bjorn@stabell.org&model=opus-4.7&bare"
    codex:        "codex"

    # Object form — full metadata
    claude-personal:
      agent: claude-code
      account: bjorn-personal
      model: sonnet-4.6
      label: Claude · personal
      color: "#a0d8a0"

    # Hybrid — string for connection bits, object for metadata
    claude-yolo:
      base: "claude-code?account=personal&bare"
      label: Claude · yolo
      color: "#ff6b6b"
      mcp_servers: [km, tribe, github]
```

The optional `base:` field on the object form lets a string carry the connection-essentials while the object carries metadata — useful when you don't want to restate fields. Object fields override `base` fields where they overlap.

## Reserved keys

Each kind declares reserved keys (default: `["default"]`). The validator rejects entries with reserved names:

```
~/.km/config.yaml: ai.acp."default" — reserved key.
Did you mean to set the active connection? Use:
  silvercode config ai.acp.default=<entry-name>
```

## Commander wiring — unified `config` namespace

One call wires the entire `<app> config ...` subcommand tree, including
generic key access and per-kind list/show/add/rm/default:

```ts
import { mountConfigCommand } from "@silvery/config/commander"

mountConfigCommand(program, config, {
  registries: {
    acp: { kind: AcpKind, describe: (e) => e.label ?? e.agent },
    mcp: { kind: McpKind, describe: (e) => e.command },
  },
})
```

That mounts:

```
<app> config                                # list all keys
<app> config <key>                          # get
<app> config <key>=<value>                  # set
<app> config --unset <key>                  # remove
<app> config --edit                         # $EDITOR
<app> config --get-regexp <pat>             # filter

<app> config <kind>                         # alias for `<kind> list`
<app> config <kind> list                    # parsed/formatted listing
<app> config <kind> show <name>             # parsed entry + connection-string projection
<app> config <kind> add <name>=<value>      # add/replace
<app> config <kind> rm <name>               # remove
<app> config <kind> default <name>          # set default
```

Dispatch rule: the token after `config` is a kind name if it matches a
registered registry; otherwise it's treated as a config key (get if no `=`,
set if `=`).

## File locations

When loaded with `appName`, two files are resolved:

| Source                        | Linux / macOS                                   | Windows                             |
| ----------------------------- | ----------------------------------------------- | ----------------------------------- |
| Global (user-wide)            | ${XDG_CONFIG_HOME:-~/.config}/<app>/config.yaml | %APPDATA%<app>\config.yaml          |
| Project (cosmiconfig walk-up) | nearest .<app>/config.yaml from cwd             | nearest .<app>/config.yaml from cwd |

Reads merge both; **project overrides global**. Writes target the explicit scope (global by default, `"local"` for project — lazy-creates the project file on first write if absent).

Override knobs on `loadConfig`:

- `path` — single explicit file (treated as global; disables project walk-up). For tests.
- `globalPath` — override the resolved global path (env-var-style: `KM_CONFIG` analog at the app layer).
- `cwd` — override the starting directory for project walk-up. Default: `process.cwd()`.
- `searchProject: false` / `searchGlobal: false` — skip one source.

The macOS choice of `~/.config/<app>` (XDG-style) over `~/Library/Preferences/<bundle>.plist` is deliberate: CLI-tool users overwhelmingly expect XDG paths; `~/Library/Preferences` is the GUI-app convention.

cosmiconfig is used **only** for the project walk-up. Its multi-format magic is disabled (`searchPlaces` is locked to `.<app>/config.{yaml,yml}`, internal cache off — we manage caching via signals/version).

## Persistence

- **Atomic writes**: write to `<path>.tmp.<random>`, rename to `<path>`. No partial-write corruption.
- **File mode**: 0o600 (user read/write only) — configs may carry sensitive paths.
- **YAML format**: `yaml` package (Eemeli Aro's; standards-compliant). Not `js-yaml` (older, fewer features).
- **Comment preservation** — comments and key order survive `load → mutate → save`. Implemented via `doc.setIn` / `doc.deleteIn` on the parsed YAML Document, with intermediate maps created via `doc.createNode({})` (the yaml package's `setIn` doesn't auto-promote plain JS objects to `YAMLMap` nodes; using `createNode` produces a real Collection that subsequent `setIn` calls can recurse through).
- **cosmiconfig — project walk-up only**: used as a vendored walk-up implementation; multi-format magic is disabled. Direct `parseDocument` handles all I/O.

## Watch mode

`loadConfig({ watch: true })` enables `fs.watch` on global + project files. External edits trigger debounced reload (default 100 ms) → `merged` recompute → signal re-fire → `onChange` listeners called.

- **Self-write filter**: a 200 ms grace window after each `save()` suppresses the watcher's reload for that file — otherwise saves would feed back as external events.
- **Lazy project watching**: when `set(_, _, "local")` lazy-creates the project file, the watcher attaches at that point.
- **Filesystem fallback**: `fs.watch` may fail on NFS / Docker bind mounts. The watcher silently degrades to no-op there; `unwatch()` is still safe.
- **Debounce**: rapid edits (editor save-on-keystroke, atomic-rename editors like vim) coalesce into one reload.

## Schema validation

- **Validate on load**: invalid config produces a clear error with file path + line + reason.
- **Validate on `set`**: catches programmatic mistakes early.
- **Validate on `save`**: last line of defense.
- **Validation errors**: include the offending YAML path (`ai.acp.foo.account`) and a fix suggestion.

## API surface (full)

```ts
// Loading
loadConfig(opts: LoadOpts): Promise<Config>

interface LoadOpts {
  appName?: string                   // XDG-style discovery (one of appName/path required)
  path?: string                      // single explicit file (treated as global)
  cwd?: string                       // override starting cwd for project walk-up
  globalPath?: string                // override resolved global path
  searchProject?: boolean            // default: true
  searchGlobal?: boolean             // default: true
  schema?: ZodSchema                 // optional whole-file validation
  defaults?: object                  // applied to missing keys (deep merge)
  createIfMissing?: boolean          // default: true
  watch?: boolean                    // fs.watch + reload + signals
  watchDebounceMs?: number           // default: 100
}

// Generic config
interface Config {
  readonly globalPath: string | null
  readonly projectPath: string | null
  readonly path: string | null       // project ?? global

  get<T = unknown>(key: string): T | undefined
  set(key: string, value: unknown, scope?: "global" | "local"): void
  unset(key: string, scope?: "global" | "local"): void
  has(key: string): boolean
  list(opts?: { pattern?: string }): Array<{ key: string; value: unknown }>
  save(opts?: { scope?: "global" | "local" }): Promise<void>
  reload(): Promise<void>
  onChange(fn: (key: string, oldVal: unknown, newVal: unknown) => void): () => void
  registry<K extends Kind>(prefix: string, kind: K): Registry<K>

  // Reactive
  signal<T = unknown>(key: string): ReadSignal<T | undefined>
  rootSignal(): ReadSignal<Record<string, unknown>>
  unwatch(): void
}

// Kinds
defineKind<S extends ZodSchema>(opts: KindOpts<S>): Kind<S>

interface KindOpts<S> {
  name: string                       // for error messages
  schema: S
  pathField?: keyof z.infer<S>       // string-form path → this field
  reservedKeys?: string[]            // default: ["default"]
  coerce?: Record<string, "boolean" | "number" | "string" | "array">
}

// Registry
interface Registry<K> {
  entries(): Array<{ name: string; value: z.infer<K["schema"]> }>
  get(name: string): z.infer<K["schema"]> | undefined
  resolve(input: string): z.infer<K["schema"]> | null   // label, string, or null
  format(name: string): string                          // → connection string
  default(): string | undefined                         // reads <prefix>.default
  setDefault(name: string): void
  add(name: string, value: string | object): void
  rm(name: string): void
  has(name: string): boolean

  // Reactive
  signalEntries(): ReadSignal<Array<{ name: string; value: z.infer<K["schema"]> }>>
  signalDefault(): ReadSignal<z.infer<K["schema"]> | undefined>
  signalGet(name: string): ReadSignal<z.infer<K["schema"]> | undefined>
}

// String parser/formatter (exported for direct use)
parseString<S extends ZodSchema>(input: string, kind: Kind<S>): z.infer<S>
formatString<S extends ZodSchema>(value: z.infer<S>, kind: Kind<S>): string

// Commander helpers (subpath: @silvery/config/commander)
mountConfigCommand(program: Command, config: Config, opts?: MountConfigOpts): void

interface MountConfigOpts {
  registries?: Record<string, { kind: Kind<any>; describe?: (entry: any) => string }>
  allowRawWrite?: boolean         // default: true (config <key>=<val> works)
  allowRegistryMutation?: boolean // default: true (config <kind> add/rm/default works)
}
```

## What's NOT in 0.21

- **Plugin system** — kinds are statically defined, no dynamic registration. (Probably never needed.)
- **More than two sources** — global + project covers all current use cases. A workspace tier or per-org tier could be added if a real need lands.
- **Encryption / secrets vault** — secrets via `{env:VAR}` substitution at read time only. App-level concern until a vault primitive exists.
- **Migration tooling** — schema migrations are app-level concerns until we have one.
- **Cross-machine sync** — git-friendly YAML is the sync mechanism (apps can `git push` their config dir).
- **JSON / TOML formats** — YAML only. Adding more formats invites cosmiconfig-style format-detection bugs.

## Dependencies

- `yaml` (Eemeli Aro's) — parse/serialize with comment preservation
- `cosmiconfig` — project walk-up only (multi-format magic disabled, internal cache off)
- `@silvery/signals` — reactive `ReadSignal` (alien-signals under the hood)
- `zod` — schema validation (peer dep)
- `@silvery/commander` — CLI wiring (peer dep, for `commander` subpath only)

No lodash. No deep-merge libraries (small inline helper).

## Test plan

Five test files (83 tests, all green):

- `parse.test.ts` — string ↔ object equivalence; coercion rules; edge cases (empty query, only path, only query, malformed); explicit scheme; bracket-array vs comma-array; nested paths.
- `registry.test.ts` — entries/get/resolve/format/default/add/rm; reserved-key rejection; string-or-object equivalence; `base:` merge semantics.
- `config.test.ts` — get/set/unset/list with patterns; deep-merge defaults; comment preservation across save; atomic write (kill-test); schema validation errors.
- `multi-source.test.ts` — global + project discovery, project overrides global, scoped writes, lazy project-file creation, single-file (legacy) mode.
- `signals.test.ts` — `signal()` / `rootSignal()` / registry signals fire on `save()` and external watch events; alien-signals value-equality (no spurious fires); `unwatch()` cleanup.

## Rollout

1. `km-silvery.config-package` — **shipped (0.21.0)**. Multi-source, scoped writes, signals, watch.
2. `km-silvercode.connection-system` — silvercode adopts the package; CLI flag refactor; `acp` + `mcp` subcommands.
3. `km-silvercode.zero-config` — built-in `BUILTIN_AGENTS` + cred-env auto-discovery for first-run.

Each bead independently shippable; chain enforced via `km bd dep`.

## Open questions for follow-up

- **`base:` in object form** — keep or drop. Useful escape hatch but adds a parse branch. Decide after silvercode adopts and we see real-world entries.
- **Encrypted secrets** — `{vault:key}` substitution alongside `{env:VAR}`. Defer until we have a vault.


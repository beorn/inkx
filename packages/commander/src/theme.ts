/**
 * `withTheme` — opt-in palette/theme selection plugin for `@silvery/commander`.
 *
 * Adds a `--theme <value>` option to any Commander command and returns a
 * resolver that turns the chosen value into a fully-derived Silvery `Theme`.
 * The default value is `"auto"`, which probes the host terminal's own palette
 * (OSC 4 / 10 / 11) and passes it through — so a Silvery CLI honors the user's
 * terminal colors with zero configuration.
 *
 * **Opt-in by design.** Import from `@silvery/commander/theme` and call
 * `withTheme()` only when your CLI wants palette selection. The core `Command`
 * import (`@silvery/commander`) stays lean and never pulls in the OSC-probe
 * machinery from `@silvery/ansi`.
 *
 * Resolution modes for `--theme <value>`:
 *   - `"auto"` (default) → detect the terminal palette via `@silvery/ansi`
 *     (probe → fingerprint → fallback). This is "pass through the terminal's
 *     palette."
 *   - `"<name>"` → a named scheme from an injected `schemes` registry, e.g.
 *     `@silvery/theme`'s `builtinPalettes` (`nord`, `dracula`, `catppuccin-mocha`…).
 *   - `"<path>.json"` → a `ColorScheme` JSON file on disk.
 *
 * @example
 * ```ts
 * import { Command } from "@silvery/commander"
 * import { withTheme } from "@silvery/commander/theme"
 * import { builtinPalettes } from "@silvery/theme/schemes"
 *
 * const program = new Command("myapp")
 * const themes = withTheme(program, { schemes: builtinPalettes })
 *
 * program.action(async (opts) => {
 *   const { theme } = await themes.resolve(opts.theme)
 *   render(<ThemeProvider theme={theme}>…</ThemeProvider>)
 * })
 *
 * program.parse()
 * ```
 */

import { InvalidArgumentError } from "commander"
import {
  detectScheme,
  deriveTheme,
  COLOR_SCHEME_FIELDS,
  type ColorScheme,
  type Theme,
  type DetectSchemeOptions,
  type DetectSource,
} from "@silvery/ansi"

/**
 * Minimal structural shape `withTheme` needs — any Commander command (the base
 * `commander` `Command` or `@silvery/commander`'s enhanced `Command`) satisfies
 * it. Kept structural so the plugin stays decoupled from the generic typed
 * `Command<Opts, …>` surface.
 */
export interface ThemeableCommand {
  option(
    flags: string,
    description: string,
    parseArg: (value: string) => string,
    defaultValue?: string,
  ): unknown
}

export interface WithThemeOptions {
  /** Long flag name (without `--`). Default `"theme"` → `--theme <value>`. */
  flag?: string
  /** Help description. Default describes the auto / named / file modes. */
  description?: string
  /**
   * Value used when the flag is omitted. Default `"auto"` (detect the terminal
   * palette). May also be a named scheme (e.g. `"dracula"`) to ship a branded
   * default while still honoring an explicit `--theme auto`.
   */
  defaultValue?: string
  /**
   * Named-scheme registry enabling `--theme <name>`. Inject `@silvery/theme`'s
   * `builtinPalettes` (84 schemes) here. Without it, only `"auto"` and file
   * paths resolve, and a bare unknown name fails loud.
   */
  schemes?: Readonly<Record<string, ColorScheme>>
  /**
   * Custom name → scheme resolver. Takes precedence over `schemes`; return
   * `undefined` to fall through to `schemes` then file resolution.
   */
  resolveScheme?: (name: string) => ColorScheme | undefined
  /**
   * Forwarded to `detectScheme()` for the `"auto"` path (`timeoutMs`, `input`,
   * `enforce`, `wcag`, `darkFallback`). `catalog` defaults to the injected
   * `schemes` so auto can fingerprint the probed palette to a named scheme.
   */
  detect?: DetectSchemeOptions
}

/** How a `--theme` value was resolved. */
export type ThemeResolutionVia = "auto" | "named" | "file"

export interface ThemeResolution {
  /** The resolved 22-slot color scheme. */
  scheme: ColorScheme
  /** The derived, validated Silvery `Theme` — hand straight to `ThemeProvider`. */
  theme: Theme
  /** Which resolution mode produced this result. */
  via: ThemeResolutionVia
  /**
   * For `via: "auto"`, the underlying detection source
   * (`fingerprint` / `probed` / `fallback` / `override` / `bg-mode`).
   */
  detected?: DetectSource
  /** Resolved scheme name, when known. */
  name?: string
}

export interface ThemeHandle {
  /** The flag's camelCased opts key, e.g. `"theme"` for `--theme`. */
  readonly optionName: string
  /**
   * Resolve a `--theme` value into a `{ scheme, theme }`. Async because the
   * `"auto"` path probes the terminal. Pass `opts.<optionName>`; omit to use
   * the configured default.
   */
  resolve(value?: string): Promise<ThemeResolution>
}

const DEFAULT_DESCRIPTION =
  'Color theme: "auto" (detect terminal), a named scheme, or a path to a palette .json'

/**
 * Install the `--theme` option on `command` and return a {@link ThemeHandle}
 * whose `resolve()` turns the chosen value into a Silvery `Theme`.
 *
 * The option is registered with a synchronous validator: a clearly-unknown name
 * fails loud at parse time (Commander prints usage) when a `schemes` registry
 * is present. `"auto"` and file paths are validated lazily in `resolve()`.
 */
export function withTheme(command: ThemeableCommand, opts: WithThemeOptions = {}): ThemeHandle {
  const flag = opts.flag ?? "theme"
  const defaultValue = opts.defaultValue ?? "auto"
  const description = opts.description ?? DEFAULT_DESCRIPTION

  command.option(`--${flag} <value>`, description, makeThemeParser(opts), defaultValue)

  return {
    optionName: camelCase(flag),
    resolve(value?: string): Promise<ThemeResolution> {
      return resolveTheme(value ?? defaultValue, opts)
    },
  }
}

/**
 * Build the Commander option parser. It stores the raw string (resolution is
 * deferred to `resolve()`), but rejects a clearly-bogus name eagerly when a
 * registry is available — fail loud, no silent fallback to `auto`.
 */
function makeThemeParser(opts: WithThemeOptions): (value: string) => string {
  return (value: string): string => {
    if (value === "auto") return value
    if (lookupScheme(value, opts)) return value
    if (looksLikeFile(value)) return value // existence + shape checked in resolve()
    const names = schemeNames(opts)
    if (names.length > 0) {
      throw new InvalidArgumentError(
        `Unknown theme "${value}". Choose "auto", a path to a palette .json, or one of: ${names.join(", ")}.`,
      )
    }
    // No registry injected — names can't be validated here. Accept and let
    // resolve() attempt file-loading, which fails loud if that isn't it either.
    return value
  }
}

async function resolveTheme(value: string, opts: WithThemeOptions): Promise<ThemeResolution> {
  if (value === "auto") {
    const catalog = opts.detect?.catalog ?? (opts.schemes ? Object.values(opts.schemes) : undefined)
    const { scheme, theme, source } = await detectScheme({ ...opts.detect, catalog })
    return { scheme, theme, via: "auto", detected: source, name: scheme.name }
  }

  const named = lookupScheme(value, opts)
  if (named) {
    return { scheme: named, theme: deriveTheme(named), via: "named", name: named.name ?? value }
  }

  const scheme = await loadSchemeFile(value)
  return { scheme, theme: deriveTheme(scheme), via: "file", name: scheme.name }
}

function lookupScheme(name: string, opts: WithThemeOptions): ColorScheme | undefined {
  return opts.resolveScheme?.(name) ?? opts.schemes?.[name]
}

function schemeNames(opts: WithThemeOptions): string[] {
  return opts.schemes ? Object.keys(opts.schemes).sort() : []
}

function looksLikeFile(value: string): boolean {
  return value.includes("/") || value.includes("\\") || value.toLowerCase().endsWith(".json")
}

function camelCase(flag: string): string {
  return flag.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

/**
 * Load a `ColorScheme` from a JSON file. Throws a Commander-friendly
 * `InvalidArgumentError` on every failure mode (unreadable, malformed JSON,
 * missing required slots) — never returns a partial or default scheme.
 */
async function loadSchemeFile(filePath: string): Promise<ColorScheme> {
  const { readFile } = await import("node:fs/promises")
  let raw: string
  try {
    raw = await readFile(filePath, "utf8")
  } catch (err) {
    throw new InvalidArgumentError(
      `Cannot read theme file "${filePath}": ${(err as Error).message}`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new InvalidArgumentError(
      `Theme file "${filePath}" is not valid JSON: ${(err as Error).message}`,
    )
  }
  return asColorScheme(parsed, filePath)
}

/** Validate that `parsed` carries all 22 required `ColorScheme` slots as strings. */
function asColorScheme(parsed: unknown, filePath: string): ColorScheme {
  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidArgumentError(`Theme file "${filePath}" must be a JSON object of color slots.`)
  }
  const record = parsed as Record<string, unknown>
  const missing = COLOR_SCHEME_FIELDS.filter((field) => typeof record[field] !== "string")
  if (missing.length > 0) {
    throw new InvalidArgumentError(
      `Theme file "${filePath}" is missing required color slot(s): ${missing.join(", ")}.`,
    )
  }
  return record as unknown as ColorScheme
}

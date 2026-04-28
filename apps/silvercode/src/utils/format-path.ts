/**
 * Display-friendly filesystem path formatting.
 *
 * Tool-call headers and related chat surfaces ship literal absolute paths
 * straight from the agent ("/Users/beorn/Bear/Vault/RESOLVER.md"). The
 * eye works much faster against tilde-shortened equivalents
 * ("~vault/RESOLVER.md", "~/Bear/Vault/RESOLVER.md"). User memory file
 * `feedback-short-paths.md` (and `feedback-vault-alias.md`) at
 * `~/.config/claude-profiles/d@delei.org/projects/-Users-beorn-Code-pim-km/memory/`
 * states the rule: paths under `$HOME` render as `~/...`, recognized aliases
 * use `~<alias>` form.
 *
 * Bead: km-silvercode.path-display-friendly.
 *
 * # Behavior
 *
 *   formatPathForDisplay("/Users/beorn/Bear/Vault/RESOLVER.md")
 *     → "~vault/RESOLVER.md"               (alias hit, longest match wins)
 *
 *   formatPathForDisplay("/Users/beorn/Code/pim/km/CLAUDE.md")
 *     → "~km/CLAUDE.md"                    (alias hit)
 *
 *   formatPathForDisplay("/Users/beorn/Documents/foo.txt")
 *     → "~/Documents/foo.txt"              (HOME fallback)
 *
 *   formatPathForDisplay("/tmp/scratch")
 *     → "/tmp/scratch"                     (outside HOME, unchanged)
 *
 *   formatPathForDisplay("relative/path.ts")
 *     → "relative/path.ts"                 (relative — left alone, no cwd resolve)
 *
 * # Aliases
 *
 * The default alias map mirrors `~/.config/km/source.sh` (sourced by zsh
 * via `hash -d`). It is intentionally a small curated subset — the goal is
 * "the eye recognises the project shorthand," not "exhaustive coverage of
 * every named directory." Long-shared-drive paths
 * (`~/Library/CloudStorage/GoogleDrive-…`) are deliberately excluded; their
 * verbose `Library/CloudStorage/…` prefix already screams "not your work
 * tree" and shortening them would hide what the agent is actually touching.
 *
 * Pass a custom alias map to `formatPathForDisplay(p, { aliases })` if a
 * caller wants different rules (e.g. a unit test, or a future user-config
 * surface). The defaults are a const so the common case is allocation-free.
 *
 * # Why not regex-substitute over arbitrary strings?
 *
 * v1 deliberately limits scope to header-paths in the tool-call display
 * widget. Doing a substring rewrite over shell command strings ("ls -la
 * '/Users/beorn/Bear/Vault/...'") risks munging quoted content the agent
 * is showing for fidelity reasons. That widening is tracked separately in
 * a follow-up bead.
 */

import { homedir } from "node:os"

/**
 * Default alias map. Maps `<alias-name>` → absolute path.
 *
 * The order matters only for ties (none expected at v1); the longest
 * matching alias path wins, regardless of map order. Keeping this curated
 * and small avoids the temptation to ship every named directory in the
 * vault config — the goal is recognition, not coverage.
 */
const DEFAULT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // Long-form first because longer paths must beat shorter prefixes —
  // the lookup logic below sorts by length anyway, but listing them
  // longest-first matches the matching order for readers.
  vault: "~/Bear/Vault",
  km: "~/Code/pim/km",
  silvery: "~/Code/pim/km/vendor/silvery",
  flexily: "~/Code/pim/km/vendor/flexily",
  termless: "~/Code/pim/km/vendor/termless",
  bearly: "~/Code/pim/km/vendor/bearly",
  loggily: "~/Code/pim/km/vendor/loggily",
  vterm: "~/Code/pim/km/vendor/vterm",
  pam: "~/Code/pim/pam",
  cloudi: "~/Code/pim/cloudi",
  kimmi: "~/Code/pim/kimmi",
  decker: "~/Code/DZ/decker",
  gbrain: "~/Code/gbrain",
  code: "~/Code",
  conf: "~/.config",
  desk: "~/Desktop",
  b: "~/Bear",
})

/**
 * Resolve `~/foo` and `~` against the given home dir. Returns the input
 * verbatim for any other shape — we don't try to handle `~user/foo` (zsh
 * named-directory-via-passwd lookups), since that's not what this helper
 * exists for.
 */
function expandHome(p: string, home: string): string {
  if (p === "~") return home
  if (p.startsWith("~/")) return `${home}/${p.slice(2)}`
  return p
}

export interface FormatPathOptions {
  /**
   * Override `$HOME`. Defaults to `process.env.HOME ?? os.homedir()`.
   * Tests pass an explicit value to keep the assertion hermetic.
   */
  home?: string
  /**
   * Override the alias map. Defaults to {@link DEFAULT_ALIASES}. Pass
   * `{}` to disable alias substitution entirely (HOME fallback still
   * applies).
   */
  aliases?: Readonly<Record<string, string>>
}

/**
 * Cache of `(home, aliasesMap) → sortedAbsoluteAliasEntries`. We recompute
 * the absolute-paths list (and the longest-first sort) once per unique
 * combination — typically once per process — instead of every render.
 *
 * The cache is keyed by reference identity for the alias object plus the
 * home string. Default callers (no `options`) always hit the same entry.
 */
const ABSOLUTE_ALIAS_CACHE = new WeakMap<
  Readonly<Record<string, string>>,
  Map<string, ReadonlyArray<{ name: string; abs: string }>>
>()

function absoluteAliasEntries(
  aliases: Readonly<Record<string, string>>,
  home: string,
): ReadonlyArray<{ name: string; abs: string }> {
  let perHome = ABSOLUTE_ALIAS_CACHE.get(aliases)
  if (!perHome) {
    perHome = new Map()
    ABSOLUTE_ALIAS_CACHE.set(aliases, perHome)
  }
  const cached = perHome.get(home)
  if (cached) return cached
  const expanded = Object.entries(aliases).map(([name, raw]) => ({
    name,
    abs: expandHome(raw, home),
  }))
  // Longest absolute path first — `~vault` (`/Users/beorn/Bear/Vault`) must
  // beat `~b` (`/Users/beorn/Bear`) for paths under the vault.
  expanded.sort((a, b) => b.abs.length - a.abs.length)
  const frozen: ReadonlyArray<{ name: string; abs: string }> = Object.freeze(expanded)
  perHome.set(home, frozen)
  return frozen
}

/**
 * Format a filesystem path for human-friendly display.
 *
 * - Absolute paths under a known alias collapse to `~<alias>/...`.
 * - Absolute paths under `$HOME` (no alias hit) collapse to `~/...`.
 * - Anything else (relative paths, `/tmp/...`, `/private/...`, paths from
 *   another user's home) returns verbatim.
 *
 * Returns the input unchanged when:
 *
 *   - `path` is empty
 *   - `path` is relative (does not start with `/`)
 *   - `path` is absolute but outside `$HOME` and outside every alias
 *
 * Behaviour is allocation-light on the no-op path: empty/relative/outside
 * inputs return the original reference, no string concatenation.
 */
export function formatPathForDisplay(path: string, options?: FormatPathOptions): string {
  if (!path) return path
  // Relative paths render verbatim — we don't have a cwd to resolve
  // against, and resolving here would silently break callers that
  // intentionally pass a project-relative `src/foo.ts`.
  if (!path.startsWith("/")) return path

  const home = options?.home ?? process.env["HOME"] ?? homedir()
  const aliases = options?.aliases ?? DEFAULT_ALIASES

  // Try aliases first (longest absolute path wins).
  const entries = absoluteAliasEntries(aliases, home)
  for (const { name, abs } of entries) {
    if (path === abs) return `~${name}`
    if (path.startsWith(`${abs}/`)) return `~${name}/${path.slice(abs.length + 1)}`
  }

  // HOME fallback.
  if (home) {
    if (path === home) return "~"
    if (path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`
  }

  // Outside HOME and every alias — show verbatim. The verbose form is
  // signal in this case ("agent is touching /tmp/...", "agent is touching
  // /private/...").
  return path
}

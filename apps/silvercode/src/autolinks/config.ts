/**
 * Smart-links configuration loader.
 *
 * Autolinks are silvercode's pattern-matched popover system: rules in
 * `<cwd>/.km/config.yaml` (per-vault) and `~/.km/config.yaml` (workspace)
 * scan displayed text for matches and render a hover popover. Per-vault
 * rules cascade onto workspace rules (vault wins on duplicate `pattern`).
 *
 * See `docs/design/autolinks.md` for the terminology + design.
 *
 * ## Config file shape
 *
 * `.km/config.yaml` is a single per-cwd config file holding multiple
 * sections. Autolink rules live under the top-level `syntaxlinks:` key:
 *
 * ```yaml
 * syntaxlinks:
 *   - pattern: "~repo"
 *     resolves_to: "/Users/beorn/Code/pim/km"
 *     preview: readme
 *
 *   - pattern: "/\\+\\w+/"
 *     resolves_to: "/Users/beorn/Code/pim/km"
 *     preview: bd-active
 *
 *   - pattern: "AGENTS.md"
 *     resolves_to: "/Users/beorn/Code/pim/km/AGENTS.md"
 *     preview: first-paragraph
 * ```
 *
 * Pattern syntax:
 *   - Literal:  pattern: "~repo"            → exact substring match (escaped)
 *   - Regex:    pattern: "/\\+\\w+/"        → JS RegExp source between leading
 *                                             slash and trailing slash; if no
 *                                             trailing slash, the entire body
 *                                             after the leading slash is the
 *                                             source. The `g` flag is always
 *                                             applied internally.
 *
 * Preview kinds (5 total):
 *   - "readme"          → fetch resolves_to (or its README.md if it's a dir);
 *                         body is rendered through MarkdownView (rich)
 *   - "first-paragraph" → fetch resolves_to, show the first non-blank paragraph;
 *                         body is rendered through MarkdownView (rich)
 *   - "bd-active"       → spawn `bd list --parent <resolves_to>
 *                         --status open --limit 5`; rendered as plain text
 *   - "shell"           → spawn user-defined `command` (structured argv form,
 *                         see below). 5s timeout, 4KB cap. Output sanitized
 *                         (ANSI / control sequences stripped) before render.
 *   - "mcp"             → STUB. Rules are dropped at config-load time with a
 *                         "not yet implemented" warning. Full impl tracked at
 *                         bead `km-silvercode.autolinks-mcp-resolver` (will be
 *                         superseded by `km-silvercode.autolinks-uri-pivot`).
 *
 * Shell-kind security model:
 *   - `command` is an OBJECT with `exec` and `args`, never a shell string:
 *
 *     ```yaml
 *     - pattern: "~repo"
 *       preview: shell
 *       command:
 *         exec: git
 *         args: ["-C", "${resolves_to}", "log", "-5", "--oneline"]
 *     ```
 *
 *   - `exec` is a bare program name (resolved via PATH) or an absolute path.
 *     Relative paths with separators are rejected.
 *   - Each `arg` has `${resolves_to}` substituted at TOKEN LEVEL — never
 *     concatenated into a shell string. No injection surface.
 *   - We spawn via Bun.spawnSync with the argv array directly — no `sh -c`.
 *   - TERM=dumb is forced in the child env so commands don't emit ANSI by
 *     default; output is also passed through a sanitizer that strips ANSI /
 *     C0 control sequences / OSC sequences before render.
 *
 * Malformed rules are dropped with a warning emitted via the silvercode
 * debug log (never throw — startup must not be blocked by user-config typos).
 */

import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import createDebug from "debug"

const log = createDebug("silvercode:autolinks:config")

export type AutolinkPreviewKind = "readme" | "first-paragraph" | "bd-active" | "shell" | "mcp"

export type AutolinkRule = {
  /** Source pattern as the user authored it (for diagnostics + cache keys). */
  readonly source: string
  /** Compiled regexp used to scan text. Always carries the `g` flag. */
  readonly regex: RegExp
  /** What the pattern resolves to (path / URL / bead-parent id). */
  readonly resolvesTo: string
  /** Preview kind to render on hover. */
  readonly preview: AutolinkPreviewKind
  /**
   * Shell command spec — required when `preview === "shell"`. Structured
   * (NOT a string) to remove all shell-injection surface:
   *
   *   - `exec` is the bare program name (resolved via PATH) or absolute
   *     path. No path separators in user-authored exec without prior
   *     allow-list (deferred). No `sh -c`.
   *   - `args` is a list of argument tokens. Each token has the literal
   *     substring `${resolves_to}` replaced with `resolvesTo` AT TOKEN
   *     LEVEL — never concatenated into a shell string.
   *
   * Example YAML:
   *
   * ```yaml
   * command:
   *   exec: git
   *   args: ["-C", "${resolves_to}", "log", "-5", "--oneline"]
   * ```
   */
  readonly command?: { readonly exec: string; readonly args: readonly string[] }
  /**
   * MCP tool name — required when `preview === "mcp"` (currently unused;
   * mcp rules are dropped at config-load time pending implementation).
   * Format: `"<server>.<tool-name>"`.
   */
  readonly tool?: string
  /**
   * MCP tool args — opaque key/value bag forwarded to the MCP call (currently
   * unused; mcp rules are dropped at config-load time pending implementation).
   */
  readonly args?: Record<string, unknown>
}

/** Default config path relative to a working directory (per-vault). */
export function defaultConfigPath(cwd: string): string {
  return join(cwd, ".km", "config.yaml")
}

/** Workspace-level config path (`~/.km/config.yaml`). */
export function workspaceConfigPath(): string {
  return join(homedir(), ".km", "config.yaml")
}

/**
 * Load + validate one YAML file at `path`. Missing file → empty list.
 * Malformed YAML → empty list (with a logged warning). Per-rule validation
 * errors drop the offending rule but keep the rest.
 */
function loadAutolinksFile(path: string): AutolinkRule[] {
  if (!existsSync(path)) return []

  let raw: string
  try {
    raw = readFileSync(path, "utf-8")
  } catch (err) {
    log(`failed to read %s: %s`, path, String(err))
    return []
  }

  return parseSyntaxlinksYaml(raw, path)
}

/**
 * Cascade workspace + per-vault autolink rules. Per-vault rules win on duplicate
 * `source` (verbatim pattern string). Workspace rules that aren't shadowed
 * appear FIRST in the returned list (lower priority — `mergeDetections`
 * scans rules in order and an earlier match wins on overlap, but a per-vault
 * override of the same source replaces the workspace entry in-place).
 *
 * Tests can drive `parseSyntaxlinksYaml` directly to bypass the filesystem;
 * cascade behavior is unit-tested via `cascadeAutolinks` below.
 */
export function loadAutolinksConfig(cwd: string): AutolinkRule[] {
  const workspaceRules = loadAutolinksFile(workspaceConfigPath())
  const vaultRules = loadAutolinksFile(defaultConfigPath(cwd))
  return cascadeAutolinks(workspaceRules, vaultRules)
}

/**
 * Pure cascade function — overlaps `vault` onto `workspace`.
 *
 * For each rule in `vault`: if a rule with the same `source` exists in
 * `workspace`, the vault rule REPLACES the workspace rule at the workspace
 * rule's original index (preserving relative ordering of other workspace
 * rules). Otherwise the vault rule is APPENDED to the result.
 *
 * Result preserves the workspace-first / vault-second priority shape that
 * `mergeDetections` (in match.ts) consumes.
 */
export function cascadeAutolinks(workspace: readonly AutolinkRule[], vault: readonly AutolinkRule[]): AutolinkRule[] {
  const result: AutolinkRule[] = workspace.slice()
  for (const vaultRule of vault) {
    const idx = result.findIndex((r) => r.source === vaultRule.source)
    if (idx >= 0) {
      result[idx] = vaultRule
    } else {
      result.push(vaultRule)
    }
  }
  return result
}

/**
 * Parse a YAML string into an `AutolinkRule[]`. Looks for the top-level
 * `syntaxlinks:` key (the `.km/config.yaml` file holds multiple sections;
 * syntax linker is one of them). Exposed separately so tests can drive the
 * parser without touching the filesystem.
 */
export function parseSyntaxlinksYaml(raw: string, sourceLabel = "<inline>"): AutolinkRule[] {
  let parsed: Record<string, unknown> | null
  try {
    parsed = Bun.YAML.parse(raw) as Record<string, unknown> | null
  } catch (err) {
    log(`%s: malformed YAML (%s); ignoring`, sourceLabel, String(err))
    return []
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return []
  }

  const entries = parsed["syntaxlinks"]
  if (!Array.isArray(entries)) {
    if (entries !== undefined) {
      log(`%s: expected \`syntaxlinks:\` array, got %s`, sourceLabel, typeof entries)
    }
    return []
  }

  const rules: AutolinkRule[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const rule = validateRule(entry, `${sourceLabel}[${i}]`)
    if (rule) rules.push(rule)
  }
  return rules
}

const VALID_PREVIEWS: ReadonlySet<AutolinkPreviewKind> = new Set<AutolinkPreviewKind>([
  "readme",
  "first-paragraph",
  "bd-active",
  "shell",
  "mcp",
])

/**
 * Restrict the `exec` field of `shell` rules. We accept either a bare
 * program name (resolved via PATH) or an absolute path. Path separators in
 * a relative `exec` are blocked because they're almost always a mistake (or
 * an attempt to load something off-disk via "../...") and the user can use
 * the absolute form if they want a specific binary. Future enhancement:
 * allow-list of trusted absolute paths from a separate config section.
 */
const EXEC_BAD_RELATIVE_PATH = /[/\\]/

function validateRule(entry: unknown, where: string): AutolinkRule | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    log(`%s: not an object`, where)
    return null
  }
  const obj = entry as Record<string, unknown>

  const pattern = obj["pattern"]
  if (typeof pattern !== "string" || pattern.length === 0) {
    log(`%s: missing/invalid \`pattern\``, where)
    return null
  }
  const resolvesTo = obj["resolves_to"]
  if (typeof resolvesTo !== "string" || resolvesTo.length === 0) {
    log(`%s: missing/invalid \`resolves_to\``, where)
    return null
  }
  const preview = obj["preview"]
  if (typeof preview !== "string" || !VALID_PREVIEWS.has(preview as AutolinkPreviewKind)) {
    log(`%s: invalid \`preview\` (got %s; expected one of %s)`, where, String(preview), [...VALID_PREVIEWS].join(", "))
    return null
  }

  let regex: RegExp
  try {
    regex = compilePattern(pattern)
  } catch (err) {
    log(`%s: invalid regex pattern \`${pattern}\` (%s)`, where, String(err))
    return null
  }

  const kind = preview as AutolinkPreviewKind

  // Per-kind validation: shell needs `command`; mcp is a config-loadable
  // stub that's dropped here pending implementation in
  // km-silvercode.autolinks-mcp-resolver (will be superseded by URI pivot).
  if (kind === "shell") {
    const command = obj["command"]
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      log(`%s: \`shell\` rule missing/invalid \`command\` (must be an object with \`exec\` and \`args\`)`, where)
      return null
    }
    const cmdObj = command as Record<string, unknown>
    const exec = cmdObj["exec"]
    if (typeof exec !== "string" || exec.length === 0) {
      log(`%s: \`shell\` rule missing/invalid \`command.exec\` (must be a non-empty string)`, where)
      return null
    }
    // Reject relative paths (program-name-with-slash). Bare names resolve
    // via PATH; absolute paths are allowed. Anything in between is rejected.
    if (!exec.startsWith("/") && EXEC_BAD_RELATIVE_PATH.test(exec)) {
      log(`%s: \`shell\` rule rejected — \`exec\` contains path separators but is not absolute (got %s)`, where, exec)
      return null
    }
    const argsRaw = cmdObj["args"]
    if (argsRaw !== undefined && !Array.isArray(argsRaw)) {
      log(`%s: \`shell\` rule \`command.args\` must be a list (got %s)`, where, typeof argsRaw)
      return null
    }
    const args: string[] = []
    if (Array.isArray(argsRaw)) {
      for (let i = 0; i < argsRaw.length; i++) {
        const a = argsRaw[i]
        if (typeof a !== "string") {
          log(`%s: \`shell\` rule \`command.args[${i}]\` must be a string (got %s)`, where, typeof a)
          return null
        }
        args.push(a)
      }
    }
    return {
      source: pattern,
      regex,
      resolvesTo,
      preview: kind,
      command: { exec, args },
    }
  }

  if (kind === "mcp") {
    // Stub — config-load only. Drop with a clear pointer to the follow-up bead.
    log(`%s: \`mcp\` preview not yet implemented — see km-silvercode.autolinks-mcp-resolver`, where)
    return null
  }

  return {
    source: pattern,
    regex,
    resolvesTo,
    preview: kind,
  }
}

/**
 * Compile a user-authored pattern into a `RegExp`.
 *
 * - Patterns starting with `/` are treated as regex source. A trailing `/`
 *   is optional (and stripped if present) — the `g` flag is always added.
 * - Otherwise the pattern is treated as a literal: the user's text is escaped
 *   so meta characters in their string don't act as regex syntax.
 */
export function compilePattern(pattern: string): RegExp {
  if (pattern.startsWith("/")) {
    let body = pattern.slice(1)
    if (body.endsWith("/") && body.length > 0) body = body.slice(0, -1)
    if (body.length === 0) throw new Error("empty regex body")
    return new RegExp(body, "g")
  }
  return new RegExp(escapeRegex(pattern), "g")
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

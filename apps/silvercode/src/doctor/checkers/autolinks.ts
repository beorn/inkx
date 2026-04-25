/**
 * Autolinks doctor checker.
 *
 * Surfaces:
 *   1. Config file presence + parse status (workspace + vault)
 *   2. Per-rule drop reasons (malformed rules)
 *   3. Cascade introspection (which rules wound up effective; overrides flagged)
 *   4. Path issues (resolves_to dead, README.md missing, shell exec not on PATH)
 *   5. fs.watch handle count (active in-process watchers — leak signal)
 *   6. mcp-stub list (config-loadable but inert)
 *
 * Exhaustively lists rules — this is the user's only window into why a rule
 * isn't firing. Symbiotic with `parseSyntaxlinksYamlWithDiagnostics` (added
 * to `../../autolinks/config.ts`).
 */

import { existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import {
  cascadeAutolinks,
  defaultConfigPath,
  loadAutolinksFileWithDiagnostics,
  workspaceConfigPath,
  type AutolinkRule,
  type AutolinksFileLoad,
  type SyntaxlinksDiagnostic,
} from "../../autolinks/config.ts"
import { _activeWatcherCount } from "../../autolinks/previews.ts"
import {
  rollupItems,
  type DoctorExtra,
  type DoctorItem,
  type DoctorSection,
  type DoctorSeverity,
} from "../index.ts"

export type AutolinksCheckerOptions = {
  /**
   * Override the workspace config path (default: `~/.km/config.yaml` via
   * `workspaceConfigPath()`). Used by tests to avoid the user's real
   * workspace config bleeding into a temp-dir scenario.
   */
  readonly workspaceConfigPath?: string
  /**
   * Override the vault config path (default: `<cwd>/.km/config.yaml`).
   */
  readonly vaultConfigPath?: string
}

/**
 * Run the autolinks checker for the given cwd. Reads workspace and vault
 * configs, cascades them, and validates each rule's reachability. Pure — no
 * caching, no mutation outside the returned report.
 */
export function runAutolinksChecker(cwd: string, opts: AutolinksCheckerOptions = {}): DoctorSection {
  const workspace = loadAutolinksFileWithDiagnostics(opts.workspaceConfigPath ?? workspaceConfigPath())
  const vault = loadAutolinksFileWithDiagnostics(opts.vaultConfigPath ?? defaultConfigPath(cwd))

  const items: DoctorItem[] = []
  const extras: DoctorExtra[] = []

  // Section 1: config file presence.
  items.push(...fileLoadItems("workspace config", workspace))
  items.push(...fileLoadItems("vault config", vault))

  // Section 2: per-rule diagnostics. Surface every drop reason so the user
  // knows why a rule they wrote isn't firing.
  const wsRules = workspace.status === "loaded" ? workspace.rules : []
  const vaultRules = vault.status === "loaded" ? vault.rules : []
  const wsDiagnostics = workspace.status === "loaded" ? workspace.diagnostics : []
  const vaultDiagnostics = vault.status === "loaded" ? vault.diagnostics : []
  items.push(...diagnosticsItems(wsDiagnostics))
  items.push(...diagnosticsItems(vaultDiagnostics))

  // Section 3: cascade introspection. Build the table the same way the
  // production loader does, then label each row with its origin. We can't
  // just call `cascadeAutolinks` directly because we lose track of which
  // workspace rules got overridden — recompute the cascade here so we can
  // tag the result.
  const cascade = buildCascadeTable(wsRules, vaultRules)
  if (cascade.length > 0) {
    extras.push({ kind: "autolinks-cascade", rows: cascade })
  }

  // Section 4: path checks for every effective rule.
  const effectiveRules = cascadeAutolinks(wsRules, vaultRules)
  items.push(...pathItems(effectiveRules))

  // Section 5: watcher count (in-process; will be 0 from a fresh CLI run
  // that hasn't resolved any previews yet, but visible if someone wires
  // doctor into the TUI later).
  const watcherCount = _activeWatcherCount()
  items.push({
    severity: "ok",
    message: `watchers — ${watcherCount} active fs.watch handle${watcherCount === 1 ? "" : "s"}`,
  })

  // Section 6: mcp stubs (visible-but-inert rules).
  const mcpRows = collectMcpStubs(wsDiagnostics, vaultDiagnostics)
  if (mcpRows.length > 0) {
    extras.push({ kind: "autolinks-mcp", rows: mcpRows })
    items.push({
      severity: "warn",
      message: `${mcpRows.length} mcp rule${mcpRows.length === 1 ? "" : "s"} loaded as stub (not implemented yet)`,
      detail: "see bead km-silvercode.autolinks-mcp-resolver",
    })
  }

  return {
    title: "autolinks",
    severity: rollupItems(items),
    items,
    extras,
  }
}

function fileLoadItems(label: string, load: AutolinksFileLoad): DoctorItem[] {
  switch (load.status) {
    case "missing":
      // Missing config is fine — empty config is valid. Mention it as ok
      // so the user knows where to put one.
      return [{ severity: "ok", message: `${label} — not present at ${load.path}` }]
    case "unreadable":
      return [
        {
          severity: "error",
          message: `${label} — unreadable at ${load.path}`,
          detail: load.reason,
        },
      ]
    case "loaded": {
      const ruleCount = load.rules.length
      return [
        {
          severity: "ok",
          message: `${label} — ${load.path} (${ruleCount} rule${ruleCount === 1 ? "" : "s"})`,
        },
      ]
    }
  }
}

function diagnosticsItems(diagnostics: readonly SyntaxlinksDiagnostic[]): DoctorItem[] {
  const items: DoctorItem[] = []
  for (const d of diagnostics) {
    if (d.kind === "yaml-error") {
      items.push({ severity: "error", message: `malformed YAML in ${d.where}`, detail: d.reason })
    } else if (d.kind === "shape-error") {
      items.push({ severity: "error", message: `${d.where}: ${d.reason}` })
    } else if (d.kind === "rule-drop") {
      items.push({
        severity: "error",
        message: `${d.where}: rule dropped`,
        detail: d.reason,
      })
    }
    // mcp-stub diagnostics are surfaced separately as a section-6 item
    // (see `collectMcpStubs` and the warn-roll up in runAutolinksChecker).
  }
  return items
}

function buildCascadeTable(
  wsRules: readonly AutolinkRule[],
  vaultRules: readonly AutolinkRule[],
): Array<{
  pattern: string
  source: "WORKSPACE" | "VAULT" | "WS→VAULT"
  resolvesTo: string
  preview: string
}> {
  // Replicate `cascadeAutolinks` ordering but track origins. Workspace rules
  // come first; vault rules either replace a workspace entry (producing
  // `WS→VAULT` at the workspace position) or append (producing `VAULT`).
  type Row = { pattern: string; source: "WORKSPACE" | "VAULT" | "WS→VAULT"; resolvesTo: string; preview: string }
  const rows: Row[] = wsRules.map((r) => ({
    pattern: r.source,
    source: "WORKSPACE",
    resolvesTo: r.resolvesTo,
    preview: r.preview,
  }))
  for (const v of vaultRules) {
    const idx = rows.findIndex((r) => r.pattern === v.source)
    if (idx >= 0) {
      rows[idx] = {
        pattern: v.source,
        source: "WS→VAULT",
        resolvesTo: v.resolvesTo,
        preview: v.preview,
      }
    } else {
      rows.push({
        pattern: v.source,
        source: "VAULT",
        resolvesTo: v.resolvesTo,
        preview: v.preview,
      })
    }
  }
  return rows
}

function pathItems(rules: readonly AutolinkRule[]): DoctorItem[] {
  const items: DoctorItem[] = []
  for (const rule of rules) {
    if (rule.preview === "readme") {
      items.push(checkReadmePath(rule))
    } else if (rule.preview === "first-paragraph") {
      items.push(checkFirstParagraphPath(rule))
    } else if (rule.preview === "shell" && rule.command) {
      items.push(checkShellExec(rule, rule.command.exec))
    }
    // bd-active uses an opaque parent id, not a filesystem path — skip.
    // mcp rules are dropped at config load — they don't reach here.
  }
  return items
}

function checkReadmePath(rule: AutolinkRule): DoctorItem {
  const target = rule.resolvesTo
  if (!existsSync(target)) {
    return {
      severity: "warn",
      message: `${rule.source} — readme target does not exist`,
      detail: target,
    }
  }
  let isDir = false
  try {
    isDir = statSync(target).isDirectory()
  } catch (err) {
    return {
      severity: "warn",
      message: `${rule.source} — stat failed on ${target}`,
      detail: String(err),
    }
  }
  if (!isDir) {
    return { severity: "ok", message: `${rule.source} — readme target readable (${target})` }
  }
  // Directory: README.md must exist somewhere with case-insensitive name.
  const candidates = ["README.md", "readme.md", "Readme.md"]
  for (const c of candidates) {
    if (existsSync(join(target, c))) {
      return { severity: "ok", message: `${rule.source} — readme target ${target} (found ${c})` }
    }
  }
  return {
    severity: "warn",
    message: `${rule.source} — directory ${target} has no README.md`,
    detail: `tried ${candidates.join(", ")}`,
  }
}

function checkFirstParagraphPath(rule: AutolinkRule): DoctorItem {
  const target = rule.resolvesTo
  if (!existsSync(target)) {
    return {
      severity: "warn",
      message: `${rule.source} — first-paragraph target does not exist`,
      detail: target,
    }
  }
  return { severity: "ok", message: `${rule.source} — first-paragraph target readable (${target})` }
}

function checkShellExec(rule: AutolinkRule, exec: string): DoctorItem {
  // Absolute paths: stat them. Bare names: shell out to `which`.
  if (exec.startsWith("/")) {
    if (!existsSync(exec)) {
      return {
        severity: "error",
        message: `${rule.source} — shell.exec missing: ${exec}`,
      }
    }
    return { severity: "ok", message: `${rule.source} — shell.exec ok (${exec})` }
  }
  // Bare name → PATH lookup. Use Bun.which when available (bun runtime).
  let resolved: string | null = null
  const bunGlobal = (globalThis as { Bun?: { which?: (cmd: string) => string | null } }).Bun
  if (bunGlobal?.which) {
    resolved = bunGlobal.which(exec)
  } else {
    // Fallback for non-Bun runtimes (rare here, but tests may import this
    // module under vitest's node runner).
    const proc = spawnSync("which", [exec], { encoding: "utf-8" })
    if (proc.status === 0 && proc.stdout) resolved = proc.stdout.trim() || null
  }
  if (!resolved) {
    return {
      severity: "error",
      message: `${rule.source} — \`shell\` rule \`exec: ${exec}\` not found on PATH`,
    }
  }
  return { severity: "ok", message: `${rule.source} — shell.exec ok (${exec} → ${resolved})` }
}

function collectMcpStubs(
  wsDiagnostics: readonly SyntaxlinksDiagnostic[],
  vaultDiagnostics: readonly SyntaxlinksDiagnostic[],
): Array<{ pattern: string; resolvesTo: string }> {
  const rows: Array<{ pattern: string; resolvesTo: string }> = []
  for (const d of [...wsDiagnostics, ...vaultDiagnostics]) {
    if (d.kind === "mcp-stub") rows.push({ pattern: d.pattern, resolvesTo: d.resolvesTo })
  }
  return rows
}

/** Re-export severity helper for symmetry. */
export type { DoctorSection, DoctorSeverity }

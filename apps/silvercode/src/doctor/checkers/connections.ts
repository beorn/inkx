/**
 * Doctor checker: `ai.acp.*` and `ai.mcp.*` registries.
 *
 * One section, four concerns rolled up:
 *
 *   1. `ai.acp.default` points at an existing entry
 *   2. Every `ai.acp.<name>` entry parses (string or object form)
 *   3. Every `mcp_servers: [...]` reference resolves to an `ai.mcp.<server>`
 *   4. Every entry has a reachable credential source (account dir / env var /
 *      built-in cred dir)
 *
 * Severity rolls up: error > warn > ok. Concerns 1–3 emit `error` when they
 * fail (config-level mistakes that block the runtime path); 4 emits `warn`
 * (the user may still fix at runtime via interactive login or a late-set
 * env var).
 *
 * Custom (non-built-in) `agent` ids skip credential reachability — we don't
 * know what counts as "creds present" for them.
 */

import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Config } from "@silvery/config"
import { AcpEntryKind, BUILTIN_AGENTS, McpKind } from "../../config-schema.ts"
import { rollupItems, type DoctorItem, type DoctorSection } from "../index.ts"

const ACP_PREFIX = "ai.acp"
const MCP_PREFIX = "ai.mcp"

export function runConnectionsChecker(config: Config): DoctorSection {
  const items: DoctorItem[] = []
  const acpReg = config.registry(ACP_PREFIX, AcpEntryKind)
  const mcpReg = config.registry(MCP_PREFIX, McpKind)
  const mcpRoot = (config.get<Record<string, unknown>>(MCP_PREFIX) ?? {}) as Record<string, unknown>
  const mcpNames = Object.keys(mcpRoot).filter((n) => n !== "default")

  // Concern 1: ai.acp.default
  const defaultLabel = config.get<string>(`${ACP_PREFIX}.default`)
  if (typeof defaultLabel === "string" && defaultLabel.length > 0) {
    const entry = acpReg.get(defaultLabel)
    if (entry) {
      items.push({ severity: "ok", message: `ai.acp.default → "${defaultLabel}" (resolves)` })
    } else {
      const labels = acpReg.entries().map((e) => e.name)
      items.push({
        severity: "error",
        message: `ai.acp.default = "${defaultLabel}" but no matching ai.acp.${defaultLabel}`,
        detail:
          labels.length > 0
            ? `Available: ${labels.join(", ")}. Fix: silvercode config acp default <name>`
            : "No ai.acp.<name> entries configured. Fix: silvercode config acp add <name>=<connection-string>",
      })
    }
  } else {
    items.push({ severity: "ok", message: "ai.acp.default — unset (built-in fallback `claude` will be used)" })
  }

  // Concerns 2–4 iterate the entries together so we only walk once.
  let entries: ReturnType<typeof acpReg.entries>
  try {
    entries = acpReg.entries()
  } catch (err) {
    items.push({
      severity: "error",
      message: "ai.acp.* — registry unreadable",
      detail: err instanceof Error ? err.message : String(err),
    })
    return { title: "ai.acp + ai.mcp", severity: rollupItems(items), items }
  }

  if (entries.length === 0) {
    items.push({ severity: "ok", message: "no ai.acp.<name> entries configured" })
    return { title: "ai.acp + ai.mcp", severity: rollupItems(items), items }
  }

  // Concern 2: per-entry parses (entries() already skips reserved keys; entries
  // that fail to parse throw inside `parseEntry` — surface those by re-iterating
  // raw keys and calling get() defensively).
  const acpRoot = (config.get<Record<string, unknown>>(ACP_PREFIX) ?? {}) as Record<string, unknown>
  for (const name of Object.keys(acpRoot).filter((n) => n !== "default")) {
    try {
      const entry = acpReg.get(name)
      if (entry) {
        items.push({ severity: "ok", message: `ai.acp.${name} — parses (agent=${entry.agent})` })
      }
    } catch (err) {
      items.push({
        severity: "error",
        message: `ai.acp.${name} — invalid entry`,
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Concerns 3 + 4: per-entry MCP refs + credential reachability.
  let totalMcpRefs = 0
  for (const { name, value } of entries) {
    // Concern 3: mcp_servers references.
    for (const serverName of value.mcp_servers ?? []) {
      totalMcpRefs++
      if (mcpReg.get(serverName)) {
        items.push({
          severity: "ok",
          message: `ai.acp.${name}.mcp_servers — "${serverName}" → ai.mcp.${serverName}`,
        })
      } else {
        items.push({
          severity: "error",
          message: `ai.acp.${name}.mcp_servers — "${serverName}" has no matching ai.mcp.${serverName}`,
          detail: mcpNames.length > 0 ? `Available: ${mcpNames.join(", ")}` : "No ai.mcp.<name> servers configured.",
        })
      }
    }

    // Concern 4: credential reachability.
    items.push(checkCredentials(name, value))
  }

  if (totalMcpRefs === 0) {
    items.push({ severity: "ok", message: "no ai.acp.* entries reference mcp_servers" })
  }

  return { title: "ai.acp + ai.mcp", severity: rollupItems(items), items }
}

/**
 * Resolve order: account dir → env var → built-in cred dir → warn.
 * Returns one DoctorItem per entry.
 */
function checkCredentials(name: string, value: { agent: string; account?: string }): DoctorItem {
  const builtin = BUILTIN_AGENTS[value.agent]
  if (!builtin) {
    return {
      severity: "ok",
      message: `ai.acp.${name} — agent="${value.agent}" is custom; credentials not checked`,
    }
  }

  if (typeof value.account === "string" && value.account.length > 0) {
    const accountDir = join(process.env["HOME"] ?? homedir(), ".km", "accounts", value.account)
    if (existsSync(accountDir)) {
      return {
        severity: "ok",
        message: `ai.acp.${name} — account="${value.account}" present`,
        detail: accountDir,
      }
    }
    // Fall through; a stray typo in `account:` shouldn't shadow a fine env-var setup.
  }

  const setEnv = builtin.credEnv.find((v) => {
    const val = process.env[v]
    return typeof val === "string" && val.length > 0
  })
  if (setEnv) {
    return { severity: "ok", message: `ai.acp.${name} — ${setEnv} set (agent=${value.agent})` }
  }

  if (builtin.credDir) {
    const expanded = expandHome(builtin.credDir)
    if (existsSync(expanded)) {
      return {
        severity: "ok",
        message: `ai.acp.${name} — credential dir present (agent=${value.agent})`,
        detail: expanded,
      }
    }
  }

  const tried: string[] = []
  if (typeof value.account === "string" && value.account.length > 0) {
    tried.push(`account="${value.account}" dir missing`)
  }
  tried.push(`env: none of [${builtin.credEnv.join(", ")}] set`)
  if (builtin.credDir) tried.push(`credDir ${builtin.credDir} not present`)
  return {
    severity: "warn",
    message: `ai.acp.${name} — no reachable credential for agent=${value.agent}`,
    detail: tried.join("; "),
  }
}

function expandHome(p: string): string {
  const home = process.env["HOME"] ?? homedir()
  if (p === "~") return home
  if (p.startsWith("~/")) return join(home, p.slice(2))
  return p
}

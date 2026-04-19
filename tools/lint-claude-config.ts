#!/usr/bin/env bun
/**
 * lint-claude-config — Drift-checker for Claude Code configuration.
 *
 * Enforces that every piece of Claude Code config is discoverable,
 * registered, and MECE (mutually exclusive, collectively exhaustive).
 *
 * What it checks:
 *  1. Hooks (.claude/hooks/*.sh): every script must be registered in
 *     .claude/settings.json OR (fallback) the user-level ~/.claude/settings.json.
 *     Every registration pointing at a project-local hook script must
 *     resolve to an existing file.
 *  2. Skills (.claude/skills/<name>/SKILL.md): frontmatter must have at
 *     least `description`. Keywords (bolded "Keywords:" line in body or
 *     explicit `keywords` frontmatter) are recommended.
 *  3. Agents (.claude/agents/<group>/<name>.md): frontmatter must have
 *     `name` and `description`.
 *  4. MCP servers (.mcp.json): command + args must be parseable.
 *
 * Usage:
 *   bun tools/lint-claude-config.ts                # lint
 *   bun tools/lint-claude-config.ts --write-manifests  # regenerate README manifests
 *   bun tools/lint-claude-config.ts --fix-suggestions  # print registration snippets
 *
 * Exit codes:
 *   0 = no drift
 *   1 = drift detected (orphans or broken registrations)
 *
 * This file is the companion to the `claude-config` activation skill.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(__filename), "..")

// ─── Types ─────────────────────────────────────────────────────────────────

interface HookRegistration {
  event: string
  matcher: string
  command: string
  source: "project" | "user"
}

interface HookInfo {
  filename: string
  path: string // absolute
  relPath: string // relative to repo root
  description: string
  /** Marked `Hook-Status: internal` in the script header — intentionally not registered */
  internal: boolean
  registrations: HookRegistration[]
  status: "ACTIVE" | "ORPHAN" | "INTERNAL"
}

interface SkillInfo {
  name: string
  path: string
  description: string
  keywords: string[]
  argumentHint?: string
  allowedTools?: string
  /** Hard-fails block exit 0 (missing description). */
  valid: boolean
  issues: string[]
  /** Soft warnings — reported but don't fail the lint. */
  warnings: string[]
}

interface AgentInfo {
  group: string
  name: string
  path: string
  description: string
  model?: string
  tools?: string
  valid: boolean
  issues: string[]
}

interface McpServerInfo {
  name: string
  command: string
  args: string[]
  valid: boolean
  issue?: string
}

interface DriftReport {
  orphanHooks: HookInfo[]
  brokenRegistrations: { registration: HookRegistration; reason: string }[]
  invalidSkills: SkillInfo[]
  invalidAgents: AgentInfo[]
  invalidMcp: McpServerInfo[]
  warnSkills: SkillInfo[]
}

// ─── Frontmatter parser (minimal) ──────────────────────────────────────────

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, body: content }
  const data: Record<string, string> = {}
  for (const rawLine of (match[1] ?? "").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const colon = line.indexOf(":")
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    let val = line.slice(colon + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    data[key] = val
  }
  return { data, body: match[2] ?? "" }
}

function extractKeywords(body: string, frontmatter: Record<string, string>): string[] {
  if (frontmatter.keywords) {
    return frontmatter.keywords
      .split(",")
      .map(k => k.trim())
      .filter(Boolean)
  }
  // Look for a bolded "**Keywords**: a, b, c" line within the first ~40 lines of body
  const firstLines = body.split(/\r?\n/).slice(0, 40).join("\n")
  const match = firstLines.match(/\*\*Keywords\*\*\s*:\s*([^\n]+)/i)
  if (!match || !match[1]) return []
  return match[1]
    .split(",")
    .map(k => k.trim().replace(/[`*]/g, ""))
    .filter(Boolean)
}

// ─── Hook discovery ────────────────────────────────────────────────────────

function readProjectHookScripts(): { filename: string; path: string; description: string; internal: boolean }[] {
  const hooksDir = join(REPO_ROOT, ".claude", "hooks")
  if (!existsSync(hooksDir)) return []
  const entries = readdirSync(hooksDir)
  const out: { filename: string; path: string; description: string; internal: boolean }[] = []
  for (const entry of entries) {
    if (!entry.endsWith(".sh")) continue
    const path = join(hooksDir, entry)
    if (!statSync(path).isFile()) continue
    // Description = first non-shebang comment line that is not a Hook-Status marker.
    // Internal = any comment line in the header matches `Hook-Status: internal`.
    const content = readFileSync(path, "utf8")
    const lines = content.split(/\r?\n/)
    let description = ""
    let internal = false
    for (const line of lines.slice(0, 20)) {
      if (line.startsWith("#!")) continue
      if (!line.startsWith("#")) {
        if (line.trim() === "") continue
        break
      }
      const stripped = line.replace(/^#\s*/, "").trim()
      if (/^Hook-Status\s*:\s*internal/i.test(stripped)) {
        internal = true
        continue
      }
      if (!description) description = stripped
    }
    out.push({ filename: entry, path, description, internal })
  }
  return out.sort((a, b) => a.filename.localeCompare(b.filename))
}

function readSettingsHooks(settingsPath: string, source: "project" | "user"): HookRegistration[] {
  if (!existsSync(settingsPath)) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(settingsPath, "utf8"))
  } catch {
    return []
  }
  const out: HookRegistration[] = []
  const hooks = (parsed as { hooks?: Record<string, unknown[]> })?.hooks
  if (!hooks || typeof hooks !== "object") return []
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      if (!group || typeof group !== "object") continue
      const matcher = (group as { matcher?: string }).matcher ?? ""
      const inner = (group as { hooks?: unknown[] }).hooks
      if (!Array.isArray(inner)) continue
      for (const h of inner) {
        if (!h || typeof h !== "object") continue
        const cmd = (h as { command?: string }).command
        if (typeof cmd !== "string") continue
        out.push({ event, matcher, command: cmd, source })
      }
    }
  }
  return out
}

function registrationPointsToHook(reg: HookRegistration, hookPath: string, hookFilename: string): boolean {
  const cmd = reg.command
  if (cmd.includes(hookFilename)) return true
  // Match on absolute path (user settings sometimes resolve $CLAUDE_PROJECT_DIR manually)
  if (cmd.includes(hookPath)) return true
  return false
}

function resolveRegistrationPath(reg: HookRegistration): string | undefined {
  // Identify commands that reference a .claude/hooks/*.sh path so we can
  // check it exists. We deliberately don't try to resolve arbitrary commands
  // like `bd prime` — only path-shaped hook invocations.
  const tokens = reg.command.split(/\s+/)
  for (const tok of tokens) {
    if (!tok.includes(".claude/hooks/") || !tok.endsWith(".sh")) continue
    let path = tok
    path = path.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1")
    if (path.startsWith("$CLAUDE_PROJECT_DIR/")) path = join(REPO_ROOT, path.slice("$CLAUDE_PROJECT_DIR/".length))
    else if (path.startsWith("$CLAUDE_PROJECT_DIR")) path = join(REPO_ROOT, path.slice("$CLAUDE_PROJECT_DIR".length))
    else if (path.startsWith("./")) path = join(REPO_ROOT, path.slice(2))
    else if (!path.startsWith("/")) path = join(REPO_ROOT, path)
    return path
  }
  return undefined
}

function analyzeHooks(): { hooks: HookInfo[]; brokenRegistrations: DriftReport["brokenRegistrations"] } {
  const scripts = readProjectHookScripts()
  const projectRegs = readSettingsHooks(join(REPO_ROOT, ".claude", "settings.json"), "project")
  const userRegs = readSettingsHooks(join(homedir(), ".claude", "settings.json"), "user")
  const allRegs = [...projectRegs, ...userRegs]

  const hooks: HookInfo[] = scripts.map(s => {
    const registrations = allRegs.filter(r => registrationPointsToHook(r, s.path, s.filename))
    const status: HookInfo["status"] =
      registrations.length > 0 ? "ACTIVE" : s.internal ? "INTERNAL" : "ORPHAN"
    return {
      filename: s.filename,
      path: s.path,
      relPath: relative(REPO_ROOT, s.path),
      description: s.description,
      internal: s.internal,
      registrations,
      status,
    }
  })

  // Registrations that point to a project-local hook path but the file does not exist.
  const brokenRegistrations: DriftReport["brokenRegistrations"] = []
  for (const reg of allRegs) {
    const resolved = resolveRegistrationPath(reg)
    if (!resolved) continue
    if (existsSync(resolved)) continue
    brokenRegistrations.push({ registration: reg, reason: `path does not exist: ${resolved}` })
  }

  return { hooks, brokenRegistrations }
}

// ─── Skills ────────────────────────────────────────────────────────────────

function analyzeSkills(): SkillInfo[] {
  const skillsDir = join(REPO_ROOT, ".claude", "skills")
  if (!existsSync(skillsDir)) return []
  const entries = readdirSync(skillsDir)
  const out: SkillInfo[] = []
  for (const entry of entries) {
    const dir = join(skillsDir, entry)
    const stat = statSync(dir)
    // Skip symlinks (aliases) and non-dirs
    if (stat.isSymbolicLink() || !stat.isDirectory()) continue
    const skillFile = join(dir, "SKILL.md")
    if (!existsSync(skillFile)) {
      out.push({
        name: entry,
        path: skillFile,
        description: "",
        keywords: [],
        valid: false,
        issues: ["missing SKILL.md"],
        warnings: [],
      })
      continue
    }
    const content = readFileSync(skillFile, "utf8")
    const { data, body } = parseFrontmatter(content)
    const issues: string[] = []
    const warnings: string[] = []
    if (!data.description) issues.push("frontmatter missing `description`")
    const keywords = extractKeywords(body, data)
    if (keywords.length === 0)
      warnings.push("no keywords (add **Keywords**: line in body or `keywords:` in frontmatter)")
    out.push({
      name: entry,
      path: skillFile,
      description: data.description ?? "",
      keywords,
      argumentHint: data["argument-hint"],
      allowedTools: data["allowed-tools"],
      valid: issues.length === 0,
      issues,
      warnings,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Agents ────────────────────────────────────────────────────────────────

function analyzeAgents(): AgentInfo[] {
  const agentsDir = join(REPO_ROOT, ".claude", "agents")
  if (!existsSync(agentsDir)) return []
  const out: AgentInfo[] = []
  for (const group of readdirSync(agentsDir)) {
    const groupDir = join(agentsDir, group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const file of readdirSync(groupDir)) {
      if (!file.endsWith(".md")) continue
      // Skip pure knowledge / registry files — they are not agent definitions.
      if (file.endsWith("-knowledge.md") || file === "ASSETS.md" || file === "INFO-ARCHITECTURE.md") continue
      const path = join(groupDir, file)
      const content = readFileSync(path, "utf8")
      const { data } = parseFrontmatter(content)
      const issues: string[] = []
      if (!data.name) issues.push("frontmatter missing `name`")
      if (!data.description) issues.push("frontmatter missing `description`")
      out.push({
        group,
        name: data.name ?? file.replace(/\.md$/, ""),
        path,
        description: data.description ?? "",
        model: data.model,
        tools: data.tools,
        valid: issues.length === 0,
        issues,
      })
    }
  }
  return out.sort((a, b) => `${a.group}/${a.name}`.localeCompare(`${b.group}/${b.name}`))
}

// ─── MCP servers ───────────────────────────────────────────────────────────

function analyzeMcp(): McpServerInfo[] {
  const mcpPath = join(REPO_ROOT, ".mcp.json")
  if (!existsSync(mcpPath)) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(mcpPath, "utf8"))
  } catch (err) {
    return [
      {
        name: "<parse-error>",
        command: "",
        args: [],
        valid: false,
        issue: `.mcp.json parse failed: ${(err as Error).message}`,
      },
    ]
  }
  const servers = (parsed as { mcpServers?: Record<string, unknown> })?.mcpServers
  if (!servers || typeof servers !== "object") return []
  const out: McpServerInfo[] = []
  for (const [name, raw] of Object.entries(servers)) {
    if (!raw || typeof raw !== "object") {
      out.push({ name, command: "", args: [], valid: false, issue: "entry is not an object" })
      continue
    }
    const cmd = (raw as { command?: string }).command
    const args = (raw as { args?: unknown[] }).args ?? []
    const issues: string[] = []
    if (typeof cmd !== "string" || cmd.length === 0) issues.push("missing or invalid `command`")
    if (!Array.isArray(args) || args.some(a => typeof a !== "string"))
      issues.push("`args` must be a string array")
    out.push({
      name,
      command: typeof cmd === "string" ? cmd : "",
      args: Array.isArray(args) ? (args.filter(a => typeof a === "string") as string[]) : [],
      valid: issues.length === 0,
      issue: issues.length > 0 ? issues.join("; ") : undefined,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Manifest rendering ────────────────────────────────────────────────────

const AUTO_GEN_HEADER = [
  "<!-- AUTO-GENERATED by tools/lint-claude-config.ts. Do not edit manually. -->",
  "<!-- Run: bun tools/lint-claude-config.ts --write-manifests -->",
].join("\n")

function renderHooksManifest(hooks: HookInfo[], broken: DriftReport["brokenRegistrations"]): string {
  const lines: string[] = []
  lines.push(AUTO_GEN_HEADER, "")
  lines.push("# Claude Code Hooks", "")
  lines.push(
    "MECE inventory of every `.claude/hooks/*.sh` script in this repo and the",
    "settings.json registrations that wire them to Claude Code events.",
    "",
    "**Status legend**",
    "",
    "- `ACTIVE` — script is registered in at least one settings.json",
    "- `INTERNAL` — marked `# Hook-Status: internal` — called by other hooks or manually",
    "- `ORPHAN` — file exists but no registration points to it (dead code — drift)",
    "",
    "## Scripts",
    "",
  )
  lines.push("| Script | Status | Events | Description |")
  lines.push("| --- | --- | --- | --- |")
  for (const h of hooks) {
    const events =
      h.registrations.length === 0
        ? "—"
        : [...new Set(h.registrations.map(r => r.event))].sort().join(", ")
    const desc = h.description.replace(/\|/g, "\\|")
    lines.push(`| \`${h.filename}\` | ${h.status} | ${events} | ${desc} |`)
  }
  lines.push("")
  lines.push("## Registrations by Event", "")
  const byEvent = new Map<string, HookRegistration[]>()
  for (const h of hooks) {
    for (const r of h.registrations) {
      if (!byEvent.has(r.event)) byEvent.set(r.event, [])
      byEvent.get(r.event)!.push(r)
    }
  }
  for (const [event, regs] of [...byEvent.entries()].sort()) {
    lines.push(`### ${event}`, "")
    for (const r of regs) {
      const matcher = r.matcher ? ` \`${r.matcher}\`` : ""
      lines.push(`- [${r.source}]${matcher} — \`${r.command}\``)
    }
    lines.push("")
  }
  if (broken.length > 0) {
    lines.push("## Broken Registrations (file missing)", "")
    for (const b of broken) {
      lines.push(`- \`${b.registration.event}\` → \`${b.registration.command}\` — ${b.reason}`)
    }
    lines.push("")
  }
  lines.push("## How to register a new hook", "")
  lines.push("```jsonc")
  lines.push("// .claude/settings.json")
  lines.push("{")
  lines.push('  "hooks": {')
  lines.push('    "WorktreeCreate": [')
  lines.push('      {')
  lines.push('        "matcher": "",')
  lines.push('        "hooks": [')
  lines.push('          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/worktree-create.sh" }')
  lines.push('        ]')
  lines.push('      }')
  lines.push('    ]')
  lines.push('  }')
  lines.push("}")
  lines.push("```")
  lines.push("")
  lines.push(
    "Valid events: `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`,",
    "`PreCompact`, `UserPromptSubmit`, `SubagentStop`, `WorktreeCreate`.",
    "",
    "Scripts should be made executable (`chmod +x`) and start with a short",
    "`# Hook:` comment line explaining what they do — the drift-checker reads",
    "that line for the manifest description.",
    "",
  )
  return lines.join("\n")
}

function renderSkillsManifest(skills: SkillInfo[]): string {
  const lines: string[] = []
  lines.push(AUTO_GEN_HEADER, "")
  lines.push("# Claude Code Skills", "")
  lines.push(
    "MECE inventory of every skill directory under `.claude/skills/`.",
    "Each skill is activated on demand by matching its keywords against",
    "the user prompt and sub-agent context.",
    "",
    "## Skills",
    "",
  )
  lines.push("| Skill | Description | Keywords |")
  lines.push("| --- | --- | --- |")
  for (const s of skills) {
    const kw = s.keywords.length > 0 ? s.keywords.map(k => `\`${k}\``).join(", ") : "—"
    const desc = (s.description || "—").replace(/\|/g, "\\|")
    lines.push(`| \`${s.name}\` | ${desc} | ${kw} |`)
  }
  lines.push("")
  const invalid = skills.filter(s => !s.valid)
  if (invalid.length > 0) {
    lines.push("## Issues", "")
    for (const s of invalid) {
      lines.push(`- \`${s.name}\` — ${s.issues.join("; ")}`)
    }
    lines.push("")
  }
  lines.push("## How to add a new skill", "")
  lines.push("```markdown")
  lines.push("<!-- .claude/skills/my-skill/SKILL.md -->")
  lines.push("---")
  lines.push("description: One-line purpose + \"Use when ...\" trigger.")
  lines.push("argument-hint: [optional|subcommands]")
  lines.push("allowed-tools: Read, Write, Bash")
  lines.push("---")
  lines.push("")
  lines.push("# My Skill")
  lines.push("")
  lines.push("**Keywords**: keyword1, keyword2, trigger phrase")
  lines.push("")
  lines.push("Skill body here ...")
  lines.push("```")
  lines.push("")
  return lines.join("\n")
}

function renderAgentsManifest(agents: AgentInfo[]): string {
  const lines: string[] = []
  lines.push(AUTO_GEN_HEADER, "")
  lines.push("# Claude Code Sub-agents", "")
  lines.push(
    "MECE inventory of sub-agent definitions under `.claude/agents/<group>/*.md`.",
    "Each agent is spawned via the `Agent` tool with `subagent_type: \"<name>\"`.",
    "",
    "## Agents",
    "",
  )
  lines.push("| Group | Name | Model | Tools | Description |")
  lines.push("| --- | --- | --- | --- | --- |")
  for (const a of agents) {
    const desc = (a.description || "—").replace(/\|/g, "\\|")
    lines.push(
      `| ${a.group} | \`${a.name}\` | ${a.model ?? "—"} | ${a.tools ?? "—"} | ${desc} |`,
    )
  }
  lines.push("")
  const invalid = agents.filter(a => !a.valid)
  if (invalid.length > 0) {
    lines.push("## Issues", "")
    for (const a of invalid) {
      lines.push(`- \`${a.group}/${a.name}\` — ${a.issues.join("; ")}`)
    }
    lines.push("")
  }
  lines.push("## How to add a new agent", "")
  lines.push("```markdown")
  lines.push("<!-- .claude/agents/expert/my-agent.md -->")
  lines.push("---")
  lines.push("name: my-agent")
  lines.push('description: "One-line summary."')
  lines.push("model: opus")
  lines.push("tools: Read, Glob, Grep, Bash, Write, Edit")
  lines.push("---")
  lines.push("")
  lines.push("# My Agent")
  lines.push("")
  lines.push("System prompt body ...")
  lines.push("```")
  lines.push("")
  return lines.join("\n")
}

function renderMcpManifest(mcp: McpServerInfo[]): string {
  const lines: string[] = []
  lines.push(AUTO_GEN_HEADER, "")
  lines.push("# MCP Servers", "")
  lines.push(
    "MECE inventory of MCP servers registered in `.mcp.json`.",
    "Each server provides a namespace of tools exposed to Claude Code.",
    "",
    "## Servers",
    "",
  )
  lines.push("| Name | Command | Args |")
  lines.push("| --- | --- | --- |")
  for (const m of mcp) {
    const args = m.args.length > 0 ? `\`${m.args.join(" ")}\`` : "—"
    lines.push(`| \`${m.name}\` | \`${m.command}\` | ${args} |`)
  }
  lines.push("")
  const invalid = mcp.filter(m => !m.valid)
  if (invalid.length > 0) {
    lines.push("## Issues", "")
    for (const m of invalid) {
      lines.push(`- \`${m.name}\` — ${m.issue}`)
    }
    lines.push("")
  }
  lines.push("## How to add a new MCP server", "")
  lines.push("```jsonc")
  lines.push("// .mcp.json")
  lines.push("{")
  lines.push('  "mcpServers": {')
  lines.push('    "my-server": {')
  lines.push('      "command": "bun",')
  lines.push('      "args": ["path/to/server.ts"]')
  lines.push('    }')
  lines.push('  }')
  lines.push("}")
  lines.push("```")
  lines.push("")
  return lines.join("\n")
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function fmtList(items: string[]): string {
  return items.map(s => `  • ${s}`).join("\n")
}

function printFixSuggestions(report: DriftReport) {
  if (report.orphanHooks.length > 0) {
    console.log("\nRegistration snippet for orphan hooks:\n")
    console.log("Add to .claude/settings.json under \"hooks\":\n")
    for (const h of report.orphanHooks) {
      const event = inferEvent(h)
      console.log(`  // ${h.filename} (${h.description})`)
      console.log(`  "${event}": [{ "matcher": "", "hooks": [{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/${h.relPath}" }] }],`)
    }
    console.log("")
  }
}

function inferEvent(h: HookInfo): string {
  const name = h.filename.toLowerCase()
  if (name.includes("session-start")) return "SessionStart"
  if (name.includes("session-end")) return "SessionEnd"
  if (name.includes("pre-compact")) return "PreCompact"
  if (name.includes("user-prompt")) return "UserPromptSubmit"
  if (name.includes("subagent")) return "SubagentStop"
  if (name.includes("worktree-create")) return "WorktreeCreate"
  if (name.includes("read-gate")) return "PreToolUse"
  if (name.includes("read-mark")) return "PostToolUse"
  if (name.includes("post-bash")) return "PostToolUse"
  return "PreToolUse"
}

function main() {
  const args = process.argv.slice(2)
  const writeManifests = args.includes("--write-manifests")
  const fixSuggestions = args.includes("--fix-suggestions")
  const quiet = args.includes("--quiet")

  const { hooks, brokenRegistrations } = analyzeHooks()
  const skills = analyzeSkills()
  const agents = analyzeAgents()
  const mcp = analyzeMcp()

  if (writeManifests) {
    writeFileSync(join(REPO_ROOT, ".claude", "hooks", "README.md"), renderHooksManifest(hooks, brokenRegistrations))
    writeFileSync(join(REPO_ROOT, ".claude", "skills", "README.md"), renderSkillsManifest(skills))
    writeFileSync(join(REPO_ROOT, ".claude", "agents", "README.md"), renderAgentsManifest(agents))
    writeFileSync(join(REPO_ROOT, ".mcp-manifest.md"), renderMcpManifest(mcp))
    if (!quiet) {
      console.log("Wrote:")
      console.log("  .claude/hooks/README.md")
      console.log("  .claude/skills/README.md")
      console.log("  .claude/agents/README.md")
      console.log("  .mcp-manifest.md")
    }
  }

  const report: DriftReport = {
    orphanHooks: hooks.filter(h => h.status === "ORPHAN"),
    brokenRegistrations,
    invalidSkills: skills.filter(s => !s.valid),
    invalidAgents: agents.filter(a => !a.valid),
    invalidMcp: mcp.filter(m => !m.valid),
    warnSkills: skills.filter(s => s.warnings.length > 0),
  }

  const drift =
    report.orphanHooks.length +
    report.brokenRegistrations.length +
    report.invalidSkills.length +
    report.invalidAgents.length +
    report.invalidMcp.length

  if (drift === 0) {
    if (!quiet) {
      const activeCount = hooks.filter(h => h.status === "ACTIVE").length
      const internalCount = hooks.filter(h => h.status === "INTERNAL").length
      console.log(
        `lint-claude-config: clean — ${hooks.length} hooks (${activeCount} active, ${internalCount} internal), ${skills.length} skills, ${agents.length} agents, ${mcp.length} MCP servers`,
      )
      if (report.warnSkills.length > 0) {
        console.log(`\nWarnings (${report.warnSkills.length}) — not fatal:`)
        for (const s of report.warnSkills) {
          console.log(`  ~ ${s.name} — ${s.warnings.join("; ")}`)
        }
      }
    }
    process.exit(0)
  }

  console.error("lint-claude-config: DRIFT DETECTED\n")
  if (report.orphanHooks.length > 0) {
    console.error(`Orphan hook scripts (${report.orphanHooks.length}) — file exists but no registration points to it:`)
    console.error(fmtList(report.orphanHooks.map(h => `${h.relPath} — ${h.description}`)))
    console.error("")
  }
  if (report.brokenRegistrations.length > 0) {
    console.error(`Broken hook registrations (${report.brokenRegistrations.length}):`)
    console.error(
      fmtList(
        report.brokenRegistrations.map(
          b => `[${b.registration.source}] ${b.registration.event} → ${b.registration.command}  (${b.reason})`,
        ),
      ),
    )
    console.error("")
  }
  if (report.invalidSkills.length > 0) {
    console.error(`Invalid skills (${report.invalidSkills.length}):`)
    console.error(fmtList(report.invalidSkills.map(s => `${s.name} — ${s.issues.join("; ")}`)))
    console.error("")
  }
  if (report.invalidAgents.length > 0) {
    console.error(`Invalid agents (${report.invalidAgents.length}):`)
    console.error(fmtList(report.invalidAgents.map(a => `${a.group}/${a.name} — ${a.issues.join("; ")}`)))
    console.error("")
  }
  if (report.invalidMcp.length > 0) {
    console.error(`Invalid MCP servers (${report.invalidMcp.length}):`)
    console.error(fmtList(report.invalidMcp.map(m => `${m.name} — ${m.issue ?? ""}`)))
    console.error("")
  }

  if (fixSuggestions) printFixSuggestions(report)
  else console.error("Run with --fix-suggestions for a registration snippet.\n")

  process.exit(1)
}

main()

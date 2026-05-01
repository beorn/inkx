#!/usr/bin/env bun
import { Command } from "@silvery/commander"
import pc from "picocolors"
import {
  profileRoot,
  profileDir,
  listProfiles,
  bootstrapProfile,
  runProfile,
  cmuxSpawn,
  initShell,
  keychainSlot,
  readKeychainForProfile,
  checkAllProfileQuotas,
  getLegacyDefaultProfile,
  findBestProfile,
  fetchProfileEmail,
  renameProfile,
  getDefaultProfile,
  setDefaultProfile,
  clearDefaultProfile,
  diagnoseAllProfiles,
  adoptStockProfile,
  type ProfileInfo,
  type HealthCheck,
} from "./profile.ts"
import { getAccountStatuses, type AccountStatus } from "./account-status.ts"

const program = new Command()

program
  .name("accountly")
  .description("Multi-profile manager for Claude Code — run multiple accounts in parallel")
  .enablePositionalOptions()
  .version("0.4.0")

// Top-level examples — shown at the end of `accountly --help`.
program.addHelpSection("Examples:", [
  ["$ accountly", "Quota table (stock + profiles) with ★ default / ● active markers, + help"],
  ["$ accountly status", "Quota table only, no help block"],
  ["$ accountly claude", "Launch claude using the default profile (from `default` symlink)"],
  ["$ accountly claude --user auto", "Pick the profile with lowest utilization and run"],
  ["$ accountly claude --user work@example.com --cmux", "Spawn a new cmux workspace for a profile"],
  ["$ accountly claude-profile default you@example.com", "Set default profile (creates `default` symlink)"],
  ["$ accountly claude-profile ls", "List all accounts: stock ~/.claude + profiles"],
  ["$ accountly claude-profile info you@example.com", "Path, Keychain slot, email for a profile"],
])

program.addHelpSection("Shell integration:", [
  [
    `$ eval "$(accountly claude-profile init)"`,
    "Shell hook (auto-detects shell, reads default from `default` symlink)",
  ],
  ["$ alias claude='accountly claude'", "Drop-in replacement for the `claude` binary"],
])

program.addHelpSection(
  "How it works:",
  [
    "Each profile is a directory under ~/.config/claude-profiles/<email>/ with its own Keychain",
    "slot `Claude Code-credentials-<sha256(dir)[0:8]>` holding a dedicated OAuth session. Shared",
    "state (settings, skills, projects, session-index.db) is symlinked from ~/.claude/. The",
    "`default` symlink inside profileRoot names the default profile, which `init` reads at",
    "install time. The stock ~/.claude still uses the unhashed slot and is surfaced as its own",
    "row so plain `claude` usage stays visible.",
  ].join("\n"),
)

// ── default (no subcommand): show profile quota status + help ─────────
// Running `accountly` with no arguments shows both the status table and the
// full help text. `accountly status` shows only the table.
program.action(async () => {
  const hasProfiles = listProfiles().length > 0 || !!getLegacyDefaultProfile()
  const statuses = await getAccountStatuses()

  if (!hasProfiles && statuses.length === 0) {
    console.log(pc.bold("accountly") + " — Multi-profile manager for Claude Code\n")
    console.log(`No profiles found under ${profileRoot()}.\n`)
    console.log(`Run ${pc.cyan("accountly claude --user <email>")} to bootstrap one,`)
    console.log(`then use /login inside claude to authenticate.\n`)
    program.outputHelp()
    return
  }

  renderAccountStatusTable(statuses)

  console.log()
  program.outputHelp()
})

// ── status (alias for default action) ───────────────────────────────────
program
  .command("status")
  .description("Show all profiles (including stock ~/.claude) with quota usage")
  .option("--json", "Output raw JSON for automation")
  .action(async (opts: { json?: boolean }) => {
    const results = await getAccountStatuses()
    if (opts.json) {
      console.log(
        JSON.stringify(
          results.map((r) => ({
            kind: r.kind,
            name: r.name,
            provider: r.provider,
            label: r.label,
            email: r.email,
            dir: r.dir,
            authenticated: r.authenticated,
            current: r.current,
            default: r.default,
            stock: r.stock,
            sourceEnvVar: r.sourceEnvVar,
            credentialHint: r.credentialHint,
            error: r.error,
            windows: r.quotas,
          })),
          null,
          2,
        ),
      )
      return
    }
    renderAccountStatusTable(results)
  })

// ── claude ──────────────────────────────────────────────────────────────
// Pins claude to a profile (by email, by `auto`, or against the default
// ~/.claude slot) and forwards remaining args — plus CLAUDE_OPTIONS env var
// — to the claude binary.
//
// Intended aliasing:
//   alias claude='accountly claude'
// After that, every `claude …` invocation goes through accountly's profile
// routing and auto-appends CLAUDE_OPTIONS globally.
const claudeCmd = program
  .command("claude")
  .description("Launch claude pinned to a profile")
  .argument("[args...]", "Arguments forwarded to claude")
  .option("-u, --user <spec>", 'Profile spec: <email> to pin, "auto" for lowest utilization, "default" for ~/.claude')
  .option("--cmux", "Spawn a new cmux workspace instead of running in-place")
  .allowUnknownOption(true)
  .passThroughOptions()

claudeCmd.addHelpSection("Examples:", [
  ["$ accountly claude", "Use default profile (from `default` symlink via init-zsh)"],
  ["$ accountly claude --user you@example.com", "Pin to a specific account by email"],
  ["$ accountly claude --user you", "Short name — fuzzy-resolves to you@example.com"],
  ["$ accountly claude --user auto", "Lowest-utilization profile picked by quota check"],
  ["$ accountly claude --user default", "Plain stock ~/.claude, no profile override"],
  ["$ accountly claude --user work@example.com --cmux", "Spawn a tagged cmux workspace"],
  ["$ accountly claude --user you@example.com --resume <id>", "Accountly flags first, rest forwarded to claude"],
])

claudeCmd.addHelpSection("Environment:", [
  ["CLAUDE_CONFIG_DIR", "If set, used instead of profileRoot/<user> (init-zsh hook sets this)"],
  ["CLAUDE_PROFILE", "Inherited as the fallback profile when --user is omitted"],
])

claudeCmd
  .addHelpSection("Shell alias / function:", [
    ["$ alias claude='accountly claude'", "Every `claude` invocation routes through accountly"],
    [
      '$ claude() { accountly claude "$@" --some-flag }',
      "Function form — accountly parses --user/--cmux, forwards everything else to claude",
    ],
  ])
  .actionMerged(async (opts: { args?: string[]; user?: string; cmux?: boolean }) => {
    const claudeArgs = opts.args ?? []
    let target: string | undefined = opts.user

    // "auto" — pick lowest-utilization profile via quota check
    if (target === "auto") {
      process.stderr.write(pc.dim("accountly: picking profile with lowest utilization…\n"))
      const results = await checkAllProfileQuotas()
      const best = findBestProfile(results)
      if (!best) {
        console.error(pc.red("accountly: no profile has available quota."))
        for (const r of results) {
          const err = r.error ?? r.quota?.error
          console.error(pc.dim(`  ${r.profile.name}: ${err ?? "all windows exhausted"}`))
        }
        process.exit(1)
      }
      process.stderr.write(pc.green(`accountly: using profile "${best.name}"\n`))
      target = best.name
    }

    // "default" or unspecified and no profile context — run against default ~/.claude
    if (target === "default" || (!target && !process.env.CLAUDE_PROFILE)) {
      if (opts.cmux) {
        console.error(pc.red("accountly: --cmux requires --user <profile>"))
        process.exit(2)
      }
      process.stderr.write(`accountly: profile=default  dir=~/.claude  action=exec-claude\n`)
      const { spawnSync } = await import("node:child_process")
      const res = spawnSync("claude", claudeArgs, { stdio: "inherit" })
      process.exit(res.status ?? 1)
    }

    // Inherit from current shell's CLAUDE_PROFILE if no --user given
    if (!target) target = process.env.CLAUDE_PROFILE

    if (!target) {
      console.error(pc.red("accountly claude: no profile resolved (pass --user <name|auto|default>)"))
      process.exit(2)
    }

    if (opts.cmux) {
      cmuxSpawn(target, claudeArgs)
    } else {
      runProfile(target, claudeArgs)
    }
  })

// ── claude-profile ──────────────────────────────────────────────────────
// Profile management subcommands. Subverbs (not flags) so `ls`, `new`, `info`,
// `init`, `migrate`, `adopt` are unambiguous and get their own help.
const profileCmd = program.command("claude-profile").description("Manage Claude Code profiles")

profileCmd.addHelpSection("Examples:", [
  ["$ accountly claude-profile ls", "List stock + profiles"],
  ["$ accountly claude-profile doctor", "Health-check all profiles"],
  ["$ accountly claude-profile adopt", "Promote stock ~/.claude to a profile"],
  ["$ accountly claude-profile default", "Show current default"],
  ["$ accountly claude-profile default you@example.com", "Set default"],
  ["$ accountly claude-profile default --clear", "Clear default"],
  ["$ accountly claude-profile new work@example.com", "Bootstrap profile dir"],
  ["$ accountly claude-profile info you@example.com", "Show profile details"],
  ["$ accountly claude-profile info you@example.com --token", "Print OAuth token"],
  ['$ eval "$(accountly claude-profile init)"', "Install shell hook"],
  ["$ accountly claude-profile init you@example.com", "Pin hook to a profile"],
  ["$ accountly claude-profile init --shell bash", "Override detected shell"],
  ["$ accountly claude-profile rename old new@example.com", "Rename profile"],
])

profileCmd.addHelpSection("Stock ~/.claude:", [
  ["~/.claude → <email>", "Unhashed default Keychain slot"],
  ["plain `claude`", "Uses the stock slot with no env vars set"],
  ["`claude /login`", "(stock shell) rewrites the stock slot only"],
])

profileCmd
  .command("ls")
  .alias("list")
  .description("List profiles with markers (★ default, ● active)")
  .action(() => {
    const profiles = listProfiles()
    const stock = getLegacyDefaultProfile()
    const rows: ProfileInfo[] = stock ? [stock, ...profiles] : [...profiles]
    if (rows.length === 0) {
      console.log(pc.dim(`no profiles (root: ${profileRoot()})`))
      console.log(pc.dim(`run \`accountly claude --user <email>\` to bootstrap one`))
      return
    }
    const defaultName = getDefaultProfile()
    const nameWidth = Math.max(10, ...rows.map((p) => p.name.length))
    console.log(`    ${pc.bold("PROFILE".padEnd(nameWidth))}  ${pc.bold("AUTH".padEnd(12))}  PATH`)
    for (const p of rows) {
      const { str: marker, width } = buildMarker(p.name, defaultName, undefined)
      const paddedMarker = marker + " ".repeat(Math.max(0, 2 - width))
      const auth = p.authenticated ? pc.green("logged-in   ") : pc.yellow("missing     ")
      console.log(`${paddedMarker}  ${p.name.padEnd(nameWidth)}  ${auth}  ${p.dir}`)
    }
    const legend: string[] = []
    if (defaultName) legend.push(`${pc.yellow("★")} default`)
    const activeMode = process.env.CLAUDE_PROFILE
      ? `CLAUDE_PROFILE=${process.env.CLAUDE_PROFILE}`
      : "stock ~/.claude (no profile pinned)"
    legend.push(`${pc.green("●")} active · ${activeMode}`)
    console.log(pc.dim(`    ${legend.join("   ")}`))
  })

profileCmd
  .command("default")
  .description("Show or set the default profile")
  .argument("[profile]", "Profile name to set as default; omit to show current")
  .option("--clear", "Remove the default pointer")
  .actionMerged((opts: { profile?: string; clear?: boolean }) => {
    if (opts.clear) {
      clearDefaultProfile()
      console.log(pc.dim("default profile cleared"))
      return
    }
    if (opts.profile) {
      try {
        setDefaultProfile(opts.profile)
        console.log(pc.green(`default → ${opts.profile}`))
        console.log(pc.dim(`symlink: ${profileRoot()}/default → ${opts.profile}`))
      } catch (err) {
        console.error(pc.red((err as Error).message))
        process.exit(1)
      }
      return
    }
    const current = getDefaultProfile()
    if (!current) {
      console.log(pc.dim("no default profile set"))
      console.log(pc.dim(`run \`accountly claude-profile default <name>\` to set one`))
      return
    }
    console.log(current)
  })

profileCmd
  .command("new")
  .description("Bootstrap a new profile dir")
  .argument("<profile>", "Profile name (preferably the Claude account email)")
  .actionMerged((opts: { profile: string }) => {
    const { dir, fresh, linked } = bootstrapProfile(opts.profile)
    if (fresh) {
      console.log(pc.green(`bootstrapped profile "${opts.profile}" at ${dir}`))
      console.log(pc.dim(`next: \`accountly claude --user ${opts.profile}\` and /login inside claude`))
    } else {
      const msg =
        linked.length > 0 ? `backfilled ${linked.length} symlink(s): ${linked.join(", ")}` : "already up to date"
      console.log(pc.dim(`profile "${opts.profile}" at ${dir} — ${msg}`))
    }
  })

profileCmd
  .command("info")
  .description("Show profile details")
  .argument("<profile>", "Profile name")
  .option("--token", "Print the current OAuth access token on stdout (for apiKeyHelper use)")
  .actionMerged(async (opts: { profile: string; token?: boolean }) => {
    const dir = profileDir(opts.profile)
    const slot = keychainSlot(dir)
    const exists = (await import("node:fs")).existsSync(dir)
    const credential = readKeychainForProfile(dir)

    if (opts.token) {
      // Token-only mode: just print the access token on stdout, nothing else.
      if (!credential) {
        console.error(pc.red(`no credential — run \`/login\` inside claude first`))
        process.exit(1)
      }
      const oauth = credential.claudeAiOauth as Record<string, unknown> | undefined
      const token =
        (oauth?.accessToken as string | undefined) ??
        (credential.accessToken as string | undefined) ??
        (credential.apiKey as string | undefined)
      if (!token) {
        console.error(pc.red("no token in credential"))
        process.exit(1)
      }
      process.stdout.write(token)
      return
    }

    console.log(`${pc.bold("profile:       ")}${opts.profile}`)
    console.log(
      `${pc.bold("dir:           ")}${dir} ${exists ? pc.green("(exists)") : pc.yellow("(not bootstrapped)")}`,
    )
    console.log(`${pc.bold("keychain slot: ")}${slot}`)
    if (!credential) {
      console.log(`${pc.bold("auth:          ")}${pc.yellow("no credential — run /login inside claude")}`)
      return
    }
    console.log(`${pc.bold("auth:          ")}${pc.green("logged in")}`)
    try {
      const info = listProfiles().find((p) => p.name === opts.profile)
      if (info) {
        const email = await fetchProfileEmail(info)
        if (email) console.log(`${pc.bold("email:         ")}${email}`)
      }
    } catch {
      /* best effort */
    }
  })

profileCmd
  .command("init")
  .description("Print shell hook (for .rc files)")
  .argument("[profile]", "Default profile; falls back to the `default` symlink")
  .option("-s, --shell <shell>", "Override detected shell (zsh or bash)")
  .actionMerged((opts: { profile?: string; shell?: string }) => {
    const shell = opts.shell ?? detectShell()
    try {
      process.stdout.write(initShell(shell, opts.profile))
    } catch (err) {
      console.error(pc.red((err as Error).message))
      process.exit(2)
    }
  })

/** Detect the user's shell from $SHELL, falling back to "zsh" if unknown. */
function detectShell(): string {
  const shellPath = process.env.SHELL ?? ""
  const base = shellPath.split("/").pop() ?? ""
  if (base === "zsh" || base === "bash") return base
  return "zsh"
}

profileCmd
  .command("rename")
  .description("Rename a profile")
  .argument("<old>", "Current profile name")
  .argument("<new>", "New profile name")
  .actionMerged((opts: { old: string; new: string }) => {
    const step = renameProfile(opts.old, opts.new)
    if (step.action === "renamed") {
      console.log(pc.green(`renamed "${opts.old}" → "${opts.new}"`))
      console.log(pc.dim(`remember to update any zshrc references (e.g. \`init zsh ${opts.new}\`)`))
    } else if (step.action === "skipped") {
      console.log(pc.dim(`skipped: ${step.reason}`))
    } else {
      console.error(pc.red(`error: ${step.reason}`))
      process.exit(1)
    }
  })

profileCmd
  .command("doctor")
  .description("Health-check all profiles; print actionable fixes for any issues found")
  .action(async () => {
    process.stderr.write(pc.dim("Running checks…\n"))
    const findings = await diagnoseAllProfiles()
    if (findings.length === 0) {
      console.log(pc.green("✓ all profiles healthy"))
      return
    }
    // Group findings by profile for readable output.
    const byProfile = new Map<string, HealthCheck[]>()
    for (const f of findings) {
      const list = byProfile.get(f.profile) ?? []
      list.push(f)
      byProfile.set(f.profile, list)
    }
    for (const [name, list] of byProfile) {
      console.log(pc.bold(name))
      for (const f of list) {
        const icon = f.level === "error" ? pc.red("✗") : f.level === "warn" ? pc.yellow("!") : pc.green("✓")
        console.log(`  ${icon} ${f.issue}`)
        if (f.fix) console.log(`    ${pc.dim("fix: " + f.fix)}`)
      }
    }
    // Nonzero exit if any errors — makes this usable as a shell health gate.
    if (findings.some((f) => f.level === "error")) process.exit(1)
  })

profileCmd
  .command("adopt")
  .description("Promote the stock ~/.claude slot to a named profile (copies credential, fetches email)")
  .option("--keep-stock", "Leave the stock slot alive instead of clearing it after adoption")
  .action(async (opts: { keepStock?: boolean }) => {
    const result = await adoptStockProfile({ clearStock: !opts.keepStock })
    if (result.status === "error") {
      console.error(pc.red(`accountly: ${result.message}`))
      process.exit(1)
    }
    console.log(pc.green(`adopted stock ~/.claude → profile "${result.email}"`))
    console.log(pc.dim(`  dir:    ${result.dir}`))
    console.log(pc.dim(`  slot:   ${result.slot}`))
    if (result.clearedStock) {
      console.log(pc.dim(`  stock:  cleared (run \`claude /login\` to re-authenticate stock)`))
    } else {
      console.log(pc.dim(`  stock:  kept intact (--keep-stock)`))
    }
  })

profileCmd
  .command("slot")
  .description("Print Keychain slot name")
  .argument("<profile>", "Profile name")
  .actionMerged((opts: { profile: string }) => {
    console.log(keychainSlot(profileDir(opts.profile)))
  })

// ── helpers ─────────────────────────────────────────────────────────────

/** Name used for the synthetic stock ~/.claude row. */
const STOCK_NAME = "~/.claude"

/**
 * Compute the visible marker for one row.
 *   ★ = default profile (from the `default` symlink)
 *   ● = active profile (what the current shell is pinned to)
 *   ~ = stock ~/.claude slot is logged into this account
 *
 * Active resolution:
 *   - If $CLAUDE_PROFILE is set → that named profile is active
 *   - Otherwise → whatever account the stock slot holds (what plain `claude` uses)
 */
function buildMarker(
  name: string,
  defaultName: string | undefined,
  stockEmail: string | undefined,
): { str: string; width: number } {
  const isDefault = defaultName !== undefined && name === defaultName
  const envProfile = process.env.CLAUDE_PROFILE
  const stockMatchesHere = stockEmail ? name === stockEmail : name === STOCK_NAME
  const isActive = envProfile ? name === envProfile : stockMatchesHere
  const parts: string[] = []
  if (isDefault) parts.push(pc.yellow("★"))
  if (isActive) parts.push(pc.green("●"))
  if (stockMatchesHere) parts.push(pc.magenta("~"))
  return { str: parts.join(""), width: parts.length }
}

function prettyPlan(raw: string | undefined): string {
  if (!raw || raw === "unknown") return ""
  // `rateLimitTier` from the credential looks like "default_claude_max_20x" / "default_claude_pro".
  const cleaned = raw.replace(/^default_claude_/, "").replace(/^claude_/, "")
  const maxMatch = /^max_(\d+)x$/.exec(cleaned)
  if (maxMatch) return `MAX${maxMatch[1]}`
  return cleaned.replace(/_/g, " ").toUpperCase()
}

interface StatusRow {
  marker: string
  markerWidth: number
  name: string
  email?: string
  group: string
  line: string
}

function statusMarker(status: AccountStatus): { str: string; width: number } {
  const parts: string[] = []
  if (status.default) parts.push(pc.yellow("★"))
  if (status.current) parts.push(pc.green("●"))
  if (status.stock) parts.push(pc.magenta("~"))
  return { str: parts.join(""), width: parts.length }
}

function renderAccountStatusTable(results: AccountStatus[]): void {
  if (results.length === 0) {
    console.log(pc.dim("no accounts found"))
    return
  }
  const rows: StatusRow[] = results.map((r) => {
    const name = r.name
    const { str: marker, width: markerWidth } = statusMarker(r)
    const email = r.email
    const group = r.kind === "claude-profile" ? `${r.label} ${prettyPlan(r.plan)}`.trim() : r.label
    if (r.kind === "claude-profile" && !r.authenticated) {
      return { marker, markerWidth, name, email, group, line: pc.yellow("missing login — run /login inside claude") }
    }
    if (r.error) {
      return { marker, markerWidth, name, email, group, line: pc.red(r.error) }
    }
    if (r.quotas.length === 0) {
      const hint = r.credentialHint ? pc.dim(` ${r.credentialHint}`) : ""
      const source = r.sourceEnvVar ? pc.dim(` (${r.sourceEnvVar})`) : ""
      const note = r.available ? pc.green("✓ key valid") : pc.red("no quota data")
      return { marker, markerWidth, name, email, group, line: `${note}${hint}${source}` }
    }
    const parts = r.quotas.map((w) => {
      const util = w.utilization
      const bar = utilizationBar(util)
      return `${w.name} ${bar} ${util.toString().padStart(3)}%`
    })
    return { marker, markerWidth, name, email, group, line: parts.join("  ") }
  })
  // Marker counts as part of name cell width so the QUOTAS column aligns across all groups.
  const markerSize = (r: StatusRow) => (r.markerWidth > 0 ? 1 + r.markerWidth : 0)
  const cellWidth = Math.max(8, ...rows.map((r) => r.name.length + markerSize(r)))

  // Group rows by plan label so each subscription tier gets its own header.
  const groups = new Map<string, StatusRow[]>()
  for (const r of rows) {
    const key = r.group || "Unknown"
    const existing = groups.get(key)
    if (existing) existing.push(r)
    else groups.set(key, [r])
  }
  let first = true
  for (const [plan, groupRows] of groups) {
    if (!first) console.log()
    first = false
    console.log(pc.bold(plan))
    for (const r of groupRows) {
      const nameCell = pc.cyan(r.name)
      const markerPart = r.markerWidth > 0 ? ` ${r.marker}` : ""
      const trailing = " ".repeat(cellWidth - r.name.length - markerSize(r))
      const suffix = r.email ? pc.dim(`  → ${r.email}`) : ""
      console.log(`${nameCell}${markerPart}${trailing}  ${r.line}${suffix}`)
    }
  }

  const stockLegend = `${pc.magenta("~")} stock ~/.claude`
  console.log(pc.dim(`${stockLegend}       ${pc.yellow("★")} default   ${pc.green("●")} current`))
}

function utilizationBar(util: number): string {
  const width = 10
  const filled = Math.round((Math.min(100, Math.max(0, util)) / 100) * width)
  const empty = width - filled
  const bar = "█".repeat(filled) + "░".repeat(empty)
  if (util >= 90) return pc.red(bar)
  if (util >= 60) return pc.yellow(bar)
  return pc.green(bar)
}

program.parse()

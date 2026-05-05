import { Command } from "@silvery/commander"
import { loadConfig } from "@silvery/config"
import { mountConfigCommand } from "@silvery/config/commander"
import { createLogger } from "loggily"
import React from "react"
import { run } from "silvery/runtime"
import { applyActiveAccountEnv } from "./accounts.ts"
import { App } from "./App.tsx"

const startupLog = createLogger("silvercode:startup")
const bootT0 = (globalThis as { __SILVERCODE_BOOT_T0?: number }).__SILVERCODE_BOOT_T0 ?? Date.now()
function startupTick(label: string, extra?: Record<string, unknown>): void {
  startupLog.info?.(label, { elapsedMs: Date.now() - bootT0, ...extra })
}
startupTick("indexModuleEvaluated")
import { AcpEntryKind, BUILTIN_AGENTS, McpKind, type AcpEntry, type McpEntry } from "./config-schema.ts"
import { runDoctor, severityToExitCode, CHECKER_NAMES } from "./doctor/index.ts"
import { renderReport } from "./doctor/render.ts"
import { resolveConnection } from "./resolve-connection.ts"
import { validateResumeId } from "./resume.ts"
import { parseSid } from "./sid-prefix.ts"

/**
 * Two-phase argv parse: scan `process.argv` for `--config <path>` /
 * `--config=<path>` (or env vars) BEFORE Commander parses, so the resolved
 * path can be passed into `loadConfig({ globalPath })` at the top of the
 * action callback. The flag is still declared on the program for `--help`
 * visibility, but its value is read pre-parse — Commander's `.action()`
 * fires after `loadConfig` runs, which is too late.
 *
 * Resolution order (most specific wins):
 *   1. `--config <path>` argv scan
 *   2. `KM_CONFIG` env (or `SILVERCODE_CONFIG` for back-compat)
 *   3. Default — env-paths-style, handled inside `@silvery/config`
 */
function resolveGlobalConfigPath(): string | undefined {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--config" && i + 1 < argv.length) return argv[i + 1]
    if (arg?.startsWith("--config=")) return arg.slice("--config=".length)
  }
  return process.env["KM_CONFIG"] ?? process.env["SILVERCODE_CONFIG"]
}

/** Layout shape silvercode supports today. */
export type SilvercodeLayout = "single" | "grid-2" | "grid-4"

/**
 * Display-friendly path: substitute `~` for `$HOME` so help output reads
 * `~/Code/pim/km` instead of `/Users/beorn/Code/pim/km`. Round-trips via
 * `expandHomePath` when the value is consumed by code.
 */
function friendlyPath(p: string): string {
  const home = process.env["HOME"]
  if (home && p.startsWith(`${home}/`)) return `~/${p.slice(home.length + 1)}`
  if (home && p === home) return "~"
  return p
}

/** Inverse of `friendlyPath` — accept `~/...` from CLI and expand to absolute. */
function expandHomePath(p: string): string {
  const home = process.env["HOME"]
  if (!home) return p
  if (p === "~") return home
  if (p.startsWith("~/")) return `${home}/${p.slice(2)}`
  return p
}

/**
 * Compute what `silvercode` (no --agent flag) would use, for display in
 * `--help`. Mirrors the implicit-path order in `resolveConnection` but
 * doesn't actually resolve creds (so help never throws).
 *
 * Returns the label that would be the starting point AND, if we can
 * trivially identify which built-in agent it'd map to (via direct
 * registry-entry lookup), the built-in id — used to mark "(active default)"
 * in the Built-in agents list.
 */
function describeDefault(config: Awaited<ReturnType<typeof loadConfig>>): {
  label: string
  source: string
  builtin: string | undefined
} {
  const envAgent =
    typeof process.env["SILVERCODE_AGENT"] === "string" && process.env["SILVERCODE_AGENT"].length > 0
      ? process.env["SILVERCODE_AGENT"]
      : typeof process.env["KM_AGENT"] === "string" && process.env["KM_AGENT"].length > 0
        ? process.env["KM_AGENT"]
        : undefined
  if (envAgent) {
    const builtin = envAgent in BUILTIN_AGENTS ? envAgent : guessBuiltinFromEntry(config, envAgent)
    return {
      label: envAgent,
      source: process.env["SILVERCODE_AGENT"] ? "SILVERCODE_AGENT env" : "KM_AGENT env",
      builtin,
    }
  }
  const cfgDefault = config.get<string>("ai.acp.default")
  if (typeof cfgDefault === "string" && cfgDefault.length > 0) {
    return {
      label: cfgDefault,
      source: "ai.acp.default in config",
      builtin: cfgDefault in BUILTIN_AGENTS ? cfgDefault : guessBuiltinFromEntry(config, cfgDefault),
    }
  }
  return { label: "claude", source: "built-in fallback (no ai.acp.default set)", builtin: "claude" }
}

/** If `label` is a registry entry whose `agent` is a built-in id, return it; else undefined. */
function guessBuiltinFromEntry(config: Awaited<ReturnType<typeof loadConfig>>, label: string): string | undefined {
  const raw = config.get<unknown>(`ai.acp.${label}`)
  if (typeof raw === "string") {
    // String form — the path segment is the agent id.
    const match = /^(?:[a-z][a-z0-9+\-.]*:\/\/)?([a-zA-Z0-9_\-]+)/.exec(raw)
    const agent = match?.[1]
    return agent && agent in BUILTIN_AGENTS ? agent : undefined
  }
  if (raw !== null && typeof raw === "object") {
    const agent = (raw as { agent?: unknown; base?: unknown }).agent
    if (typeof agent === "string" && agent in BUILTIN_AGENTS) return agent
    const base = (raw as { base?: unknown }).base
    if (typeof base === "string") {
      const match = /^(?:[a-z][a-z0-9+\-.]*:\/\/)?([a-zA-Z0-9_\-]+)/.exec(base)
      const agentFromBase = match?.[1]
      return agentFromBase && agentFromBase in BUILTIN_AGENTS ? agentFromBase : undefined
    }
  }
  return undefined
}

async function buildProgram(): Promise<Command> {
  // Resolve global config path BEFORE parsing flags — Commander's
  // `.action()` callback fires after `loadConfig`, but the `--config`
  // flag (and KM_CONFIG / SILVERCODE_CONFIG env) need to influence
  // where loadConfig looks. See `resolveGlobalConfigPath` above.
  startupTick("loadConfig:start")
  const config = await loadConfig({ appName: "km", globalPath: resolveGlobalConfigPath(), watch: false })
  startupTick("loadConfig:done")

  const program = new Command()
  program
    .name("silvercode")
    .description("silvery-native agent workspace (internal)")
    // Connection (what to run)
    .option("--agent <id>", "label, connection-string, or built-in id")
    .option("--model <name>", "override model (transient)")
    .option("--account <name>", "credentials profile (transient)")
    // Session
    .option("--resume <id>", "resume session id")
    // Paths
    .option("--cwd <path>", "working directory", friendlyPath(process.cwd()))
    .option("--log-dir <path>", "event-log directory", "")
    .option("--config <path>", "config file path (overrides KM_CONFIG)")
    .action(async (opts: Record<string, unknown>) => {
      const cwd = expandHomePath(String(opts.cwd ?? process.cwd()))

      // --resume parsing: if the input is `<agent>:<bareSid>` (the form
      // `formatResumeHint` prints on quit), pull out the agent so the
      // user doesn't have to remember `--agent` separately. An explicit
      // `--agent` always wins; if it conflicts with the prefix, error
      // out rather than silently using the wrong backend.
      const resumeRaw = typeof opts.resume === "string" && opts.resume.length > 0 ? opts.resume : undefined
      let agentInput = opts.agent as string | undefined
      let resume: string | undefined = resumeRaw
      if (resumeRaw !== undefined) {
        const { agent: prefixAgent, bareSid: bareResume } = parseSid(resumeRaw)
        if (prefixAgent !== null) {
          if (agentInput === undefined) {
            agentInput = prefixAgent
          } else if (agentInput !== prefixAgent) {
            process.stderr.write(
              `silvercode: --agent ${agentInput} conflicts with sid prefix ${prefixAgent}: in --resume.\n` +
                `Either drop --agent (the prefix selects the right backend) or use --resume ${bareResume}\n`,
            )
            process.exitCode = 2
            return
          }
          resume = bareResume
        }
      }

      const resolved = resolveConnection(agentInput, config)

      const account =
        typeof opts.account === "string" && opts.account.length > 0 ? opts.account : resolved.entry.account

      // Propagate the requested account to silvercode's OWN process env so
      // SidePanel's resolveActiveEmail() returns the correct identity. Without
      // this, the spawned Claude subprocess bills the right account but the
      // side-panel still shows whatever the user's shell had CLAUDE_CONFIG_DIR
      // set to (typically the default account from .zshrc). The subprocess
      // path (spawnClaude) sets its own env explicitly so this doesn't break
      // anything downstream.
      applyActiveAccountEnv(account)

      const model =
        typeof opts.model === "string" && opts.model.length > 0
          ? opts.model
          : (resolved.entry.model ?? BUILTIN_AGENTS[resolved.entry.agent]?.defaultModel ?? "")
      const bare = resolved.entry.bare === true || resolved.entry.options?.["bare"] === true

      // Pre-flight: validate --resume <id> BEFORE entering alt-screen.
      // A bogus id (synthetic, missing JSONL) would otherwise produce a
      // blank UI — the runtime error path sets state.lastError but no
      // component renders it. Bead: km-silvercode.resume-blank-screen.
      if (resume !== undefined) {
        const validationError = validateResumeId({
          agent: resolved.entry.agent,
          sessionId: resume,
          cwd,
        })
        if (validationError !== null) {
          process.stderr.write(validationError)
          process.exitCode = 2
          return
        }
      }

      startupTick("run:start", { agent: resolved.entry.agent, account })
      const handle = await run(
        <App
          cwd={cwd}
          model={model}
          resume={resume}
          bare={bare}
          layout="single"
          agent={resolved.entry.agent}
          logDir={typeof opts.logDir === "string" && opts.logDir.length > 0 ? opts.logDir : undefined}
          account={account}
          paneHeaders={false}
        />,
        // handleTabCycling: false so Shift+Tab reaches our useInput for the
        // permission-mode cycle binding (Claude Code convention). Silvercode
        // has a single TextInput — focus navigation via Tab isn't useful.
        { mode: "fullscreen", handleTabCycling: false },
      )
      startupTick("run:resolved")
      await handle.waitUntilExit()
    })

  // Show the default that would be used if `silvercode` is invoked with no
  // --agent flag. Mirrors the implicit-path order in resolveConnection.
  const defaultInfo = describeDefault(config)

  program.addHelpSection(
    "Built-in agents:",
    Object.values(BUILTIN_AGENTS).map((a) => {
      const marker = a.id === defaultInfo.builtin ? " (active default)" : ""
      return [a.id, a.description + marker] as [string, string]
    }),
  )

  program.addHelpSection("Default:", [[defaultInfo.label, `from ${defaultInfo.source}`]])

  program.addHelpSection("Examples:", [
    ["$ silvercode", "use the default"],
    ["$ silvercode --agent claude-work", "named registry preset"],
    ["$ silvercode --agent codex", "built-in id"],
    ["$ silvercode --agent 'codex?model=gpt-5-mini'", "ad-hoc connection string"],
    ["$ silvercode --resume <session-id>", "resume prior session"],
    ["$ silvercode config", "list all config leaves"],
    ["$ silvercode config acp", "list ai.acp.* presets"],
    ["$ silvercode config ai.acp.foo=bar", "set a leaf"],
    ["$ silvercode doctor", "health-check"],
  ])

  program.addHelpSection("Environment:", [
    ["SILVERCODE_AGENT", "default connection; --agent wins on conflict"],
    ["KM_AGENT", "fallback for SILVERCODE_AGENT"],
    ["KM_CONFIG", "config file path (or --config)"],
    ["SILVERCODE_CONFIG", "fallback for KM_CONFIG"],
  ])

  // `silvercode config ...` — generic key access + per-kind list/show/add/rm/default
  // for ai.acp.* and ai.mcp.*. The `section: "ai"` opt prefixes registry kinds.
  mountConfigCommand(program, config, {
    section: "ai",
    registries: {
      acp: { kind: AcpEntryKind, describe: (e) => (e as AcpEntry).label ?? (e as AcpEntry).agent },
      mcp: { kind: McpKind, describe: (e) => (e as McpEntry).command },
    },
  })

  // `silvercode doctor [checker]` — config + integration health check.
  // Exits before any TUI mounts. CLI-only for v1; the in-TUI `/doctor`
  // slash command is deferred (tracked by bead km-silvercode.doctor).
  const doctor = program
    .command("doctor")
    .description("health-check config + integrations (autolinks, connections)")
    .argument("[checker]", `restrict to one checker (${CHECKER_NAMES.join(", ")})`)
    .option("--cwd <path>", "directory whose .km/config.yaml to inspect", process.cwd())
    .option("--json", "emit the structured DoctorReport as JSON instead of the ANSI report")
    .action(async (arg: string | undefined, opts: Record<string, unknown>) => {
      const cwd = expandHomePath(String(opts.cwd ?? process.cwd()))
      const only = arg ? [arg] : undefined
      if (only && !CHECKER_NAMES.includes(only[0]! as (typeof CHECKER_NAMES)[number])) {
        process.stderr.write(`silvercode doctor: unknown checker "${only[0]}". Known: ${CHECKER_NAMES.join(", ")}\n`)
        process.exitCode = 2
        return
      }
      const report = await runDoctor({ cwd, only })
      if (opts["json"]) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      } else {
        process.stdout.write(renderReport(report))
      }
      process.exitCode = severityToExitCode(report.severity)
    })
  // Per-checker subcommand: `silvercode doctor autolinks`. Same outcome as
  // passing `autolinks` as a positional, kept around because users typing
  // `silvercode doctor autolinks` (the `gh extension doctor <name>` shape)
  // should just work without re-reading help.
  for (const name of CHECKER_NAMES) {
    doctor
      .command(name)
      .description(`Health-check the ${name} subsystem`)
      .option("--cwd <path>", "directory whose .km/config.yaml to inspect", process.cwd())
      .option("--json", "emit the structured DoctorReport as JSON instead of the ANSI report")
      .action(async (opts: Record<string, unknown>) => {
        const cwd = expandHomePath(String(opts.cwd ?? process.cwd()))
        const report = await runDoctor({ cwd, only: [name] })
        if (opts["json"]) {
          process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
        } else {
          process.stdout.write(renderReport(report))
        }
        process.exitCode = severityToExitCode(report.severity)
      })
  }

  return program
}

export async function main(): Promise<void> {
  const program = await buildProgram()
  await program.parseAsync(process.argv)
}

import { Command } from "@silvery/commander"
import { HOOK_EVENTS, type EnrichmentFields, type HookEvent, loadListeners, runIngest, runNotify } from "@km/hooks"

interface HookOptions {
  event?: string
  source?: string
  activityText?: string
  toolName?: string
  finalMessage?: string
  hookEventName?: string
  notificationType?: string
  metadataBase64?: string
  projectPath?: string
  sessionId?: string
}

function parseEnrichment(opts: HookOptions): EnrichmentFields {
  const out: EnrichmentFields = {}
  if (opts.activityText) out.activityText = opts.activityText
  if (opts.toolName) out.toolName = opts.toolName
  if (opts.finalMessage) out.finalMessage = opts.finalMessage
  if (opts.hookEventName) out.hookEventName = opts.hookEventName
  if (opts.notificationType) out.notificationType = opts.notificationType
  if (opts.metadataBase64) {
    try {
      out.metadata = JSON.parse(Buffer.from(opts.metadataBase64, "base64").toString("utf8"))
    } catch {
      // Drop invalid metadata silently — hook CLIs must not throw on bad input
    }
  }
  return out
}

function isValidEvent(event: string): event is HookEvent {
  return (HOOK_EVENTS as readonly string[]).includes(event)
}

function debug(msg: string): void {
  if (process.env.KM_HOOKS_DEBUG) process.stderr.write(`[km hooks] ${msg}\n`)
}

async function runCommand(mode: "ingest" | "notify", opts: HookOptions): Promise<void> {
  const event = opts.event ?? ""
  if (!isValidEvent(event)) {
    if (mode === "notify") return // silent drop for best-effort mode
    process.stderr.write(`[km hooks] invalid event: ${opts.event ?? "(missing)"}\n`)
    process.stderr.write(`[km hooks] valid events: ${HOOK_EVENTS.join(", ")}\n`)
    // Exit 0 anyway — non-zero exit from a Claude Code hook can block the session
    return
  }
  const source = opts.source ?? "claude"
  const listeners = await loadListeners({ projectPath: opts.projectPath })
  const enrichment = parseEnrichment(opts)
  const run = mode === "ingest" ? runIngest : runNotify
  const result = await run(listeners, event, source, enrichment, {
    sessionId: opts.sessionId,
    projectPath: opts.projectPath,
  })
  debug(`${mode} ${event} source=${source} listeners=${result.listeners.length} total=${result.totalMs}ms`)
  for (const r of result.listeners) {
    debug(`  ${r.name}: ${r.status} ${r.durationMs}ms${r.error ? ` error="${r.error}"` : ""}`)
  }
}

function buildSubcommand(mode: "ingest" | "notify"): Command {
  const description =
    mode === "ingest"
      ? "Ingest a hook event (synchronous; 5s listener timeout)."
      : "Notify a hook event (best-effort; 100ms listener timeout, never blocks callers)."
  return new Command(mode)
    .description(description)
    .requiredOption("--event <event>", `Event: ${HOOK_EVENTS.join(" | ")}`)
    .option("--source <source>", "Source: claude | codex | gemini | opencode | km | ...", "claude")
    .option("--activity-text <text>", "Short activity summary")
    .option("--tool-name <name>", "Tool name (for tool-related events)")
    .option("--final-message <message>", "Assistant's final message (for stop events)")
    .option("--hook-event-name <name>", "Original agent-side hook event name (e.g. PreToolUse)")
    .option("--notification-type <type>", "Notification subtype (e.g. permission_prompt)")
    .option("--metadata-base64 <b64>", "Base64-encoded JSON metadata payload")
    .option("--project-path <path>", "Project path (for loading project-local listeners)")
    .option("--session-id <id>", "Session identifier")
    .action(async (opts: HookOptions) => {
      await runCommand(mode, opts)
    })
}

export function hooksCommand(): Command {
  return new Command("hooks")
    .description("Unified hook dispatch — route agent lifecycle events to pluggable listeners.")
    .addCommand(buildSubcommand("ingest"))
    .addCommand(buildSubcommand("notify"))
}

#!/usr/bin/env bun
/**
 * recall — qmd-backed session memory search and exporter.
 *
 * Replaces the km-project-local `bun recall` (bearly FTS5 over
 * ~/.claude/session-index.db) with a unified, cross-project tool. Exports
 * Claude Code session JSONLs as plain markdown into ~/Bear/Vault/raw/chats/
 * so qmd (which already has a "sessions" collection indexing that dir) can
 * search, embed, and rerank them like any other markdown.
 *
 * Commands:
 *   recall <query> [-n N] [-c cols] [--json]    hybrid search via qmd
 *   recall export <session-id|jsonl-path>       export a single session
 *   recall export --all [--force]               bootstrap: export every session
 *   recall hook                                  UserPromptSubmit hook mode
 *   recall index                                 run `qmd update`
 *   recall status                                counts + qmd status
 *   recall help
 *
 * Design notes:
 *   - Session markdown is the source of truth for everything except the live
 *     JSONL files. qmd indexes it via its post-commit hook + `qmd update`.
 *   - Output filename: YYYY-MM-DDTHHMM-<slug>.md (per EPIC - Knowledge Infra plan).
 *   - Idempotent: existing output files are skipped unless --force.
 *   - Hook mode emits `hookSpecificOutput.additionalContext` JSON so Claude
 *     Code renders it as "Session Memory" inline on every prompt.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { homedir } from "node:os"
import { spawnSync } from "node:child_process"
// Envelope framing primitives. See km-bearly.injection-envelope-lib. The
// accountly recall hook emits UserPromptSubmit additionalContext — it must
// route through the shared library so the hardened wrapper, imperative
// rewrite, sanitizer, and turn-manifest side effect all stay in one place.
// Relative path because accountly lives in vendor/accountly/ alongside
// vendor/bearly/ in the km monorepo.
import {
  wrapInjectedContext as envelopeWrap,
  emitHookJson as envelopeEmitHookJson,
  sanitize as envelopeSanitize,
  type InjectedItem,
} from "../../bearly/plugins/injection-envelope/src/index.ts"
import { emitInjectionDebugEvent } from "../../bearly/plugins/injection-envelope/src/debug.ts"

const HOME = homedir()
const SESSIONS_DIR = process.env.RECALL_SESSIONS_DIR ?? `${HOME}/Bear/Vault/raw/chats`
const CLAUDE_PROJECTS_DIR = `${HOME}/.claude/projects`
const QMD = "qmd"

// ── JSONL session parsing ────────────────────────────────────────────────

interface ContentBlock {
  type: string
  text?: string
  name?: string
}

interface JsonlEntry {
  type?: string
  sessionId?: string
  timestamp?: string
  cwd?: string
  message?: {
    role?: "user" | "assistant" | "system"
    content?: string | ContentBlock[]
  }
}

function extractText(entry: JsonlEntry): string {
  const content = entry.message?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
  }
  return ""
}

interface SessionMeta {
  sessionId: string
  jsonlPath: string
  startTime: Date
  project: string
  messageCount: number
  firstUserText: string
}

function readSessionMeta(jsonlPath: string): SessionMeta | undefined {
  let content: string
  try {
    content = readFileSync(jsonlPath, "utf-8")
  } catch {
    return undefined
  }
  const lines = content.split("\n").filter((l) => l.trim().length > 0)
  if (lines.length === 0) return undefined

  let sessionId = ""
  let startTime: Date | undefined
  let project = ""
  let messageCount = 0
  let firstUserText = ""

  for (const line of lines) {
    let entry: JsonlEntry
    try {
      entry = JSON.parse(line) as JsonlEntry
    } catch {
      continue
    }
    if (!sessionId && entry.sessionId) sessionId = entry.sessionId
    if (!startTime && entry.timestamp) startTime = new Date(entry.timestamp)
    if (!project && entry.cwd) project = entry.cwd
    if (entry.type === "user" || entry.type === "assistant") messageCount++
    if (!firstUserText && entry.type === "user") {
      const txt = extractText(entry).trim()
      // Skip synthetic system-generated user turns (tool results, reminders)
      if (txt && !txt.startsWith("<") && !txt.startsWith("[")) {
        firstUserText = txt.slice(0, 200)
      }
    }
  }

  if (!sessionId || !startTime) return undefined
  return { sessionId, jsonlPath, startTime, project, messageCount, firstUserText }
}

export function slugFromText(text: string): string {
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const words = clean.split(" ").slice(0, 8).join("-")
  return words.slice(0, 50) || "session"
}

function sessionFilename(meta: SessionMeta): string {
  const d = meta.startTime
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}`
  const slug = slugFromText(meta.firstUserText)
  return `${date}T${time}-${slug}.md`
}

// ── markdown rendering ───────────────────────────────────────────────────

function renderSessionMarkdown(meta: SessionMeta): string {
  const out: string[] = []
  out.push("---")
  out.push(`session_id: ${meta.sessionId}`)
  out.push(`started: ${meta.startTime.toISOString()}`)
  out.push(`project: ${meta.project}`)
  out.push(`messages: ${meta.messageCount}`)
  out.push(`source: ${meta.jsonlPath}`)
  out.push("---")
  out.push("")
  out.push(`# Session ${meta.startTime.toISOString().slice(0, 16).replace("T", " ")}`)
  out.push("")
  if (meta.firstUserText) {
    out.push(`> ${meta.firstUserText.replace(/\n/g, " ").slice(0, 160)}`)
    out.push("")
  }

  const content = readFileSync(meta.jsonlPath, "utf-8")
  for (const line of content.split("\n")) {
    if (!line.trim()) continue
    let entry: JsonlEntry
    try {
      entry = JSON.parse(line) as JsonlEntry
    } catch {
      continue
    }
    if (entry.type !== "user" && entry.type !== "assistant" && entry.type !== "system") continue
    const text = extractText(entry).trim()
    if (!text) continue
    // Skip synthetic user turns that are just tool results wrapped as user
    if (entry.type === "user" && (text.startsWith("<") || text.startsWith("["))) continue
    const heading = entry.type === "user" ? "## User" : entry.type === "assistant" ? "## Assistant" : "## System"
    out.push(heading)
    out.push("")
    out.push(text)
    out.push("")
  }
  return out.join("\n")
}

// ── commands ─────────────────────────────────────────────────────────────

function listAllJsonlPaths(): string[] {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return []
  const paths: string[] = []
  for (const entry of readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pdir = join(CLAUDE_PROJECTS_DIR, entry.name)
    try {
      for (const f of readdirSync(pdir)) {
        if (f.endsWith(".jsonl")) paths.push(join(pdir, f))
      }
    } catch {
      /* skip unreadable project dir */
    }
  }
  return paths
}

function findJsonlBySessionId(sessionId: string): string | undefined {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return undefined
  // Session IDs are UUIDs. Reject anything else to prevent path traversal via
  // sessionId containing slashes or "..".
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return undefined
  }
  for (const entry of readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = join(CLAUDE_PROJECTS_DIR, entry.name, `${sessionId}.jsonl`)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function cmdExport(args: string[]): void {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true })
  const force = args.includes("--force")
  const all = args.includes("--all")
  const isHook = args.includes("--hook")
  // --catchup: "export anything missing, silently".
  // Same filesystem scan as --all but:
  //   - stderr stays empty unless we actually wrote something (no spam on
  //     every SessionStart when there's nothing to do)
  //   - when combined with --hook, emits a valid empty hook response
  //   - fires a fire-and-forget `qmd update` at the end if new files were
  //     written, so the search index picks up fresh exports without the user
  //     having to remember to run `recall index`
  // This is the "system always tries to complete stuff" path: wire it into
  // SessionStart and missing-export state self-heals over time.
  const isCatchup = args.includes("--catchup")

  let jsonlPaths: string[] = []
  if (isCatchup) {
    jsonlPaths = listAllJsonlPaths()
  } else if (isHook) {
    // SessionEnd hook input shape: JSON on stdin with { session_id, ... }
    // We read it, find the matching JSONL, export it, then emit empty hook JSON.
    let raw = ""
    try {
      raw = readFileSync(0, "utf-8")
    } catch {
      /* no stdin */
    }
    let input: { session_id?: string } = {}
    try {
      input = JSON.parse(raw) as { session_id?: string }
    } catch {
      /* ignore */
    }
    const sid = input.session_id
    if (!sid) {
      // No session id — emit valid empty hook JSON and exit cleanly.
      process.stdout.write(emitHookJson("SessionEnd"))
      return
    }
    const found = findJsonlBySessionId(sid)
    if (!found) {
      process.stdout.write(emitHookJson("SessionEnd"))
      return
    }
    jsonlPaths = [found]
  } else if (all) {
    jsonlPaths = listAllJsonlPaths()
  } else {
    const positional = args.find((a) => !a.startsWith("--"))
    if (!positional) {
      process.stderr.write("usage: recall export <session-id|jsonl-path> | --all [--force] | --hook\n")
      process.exit(2)
    }
    if (positional.includes("/") || positional.endsWith(".jsonl")) {
      // Restrict explicit paths to jsonl files under ~/.claude/projects/ so
      // users can't accidentally (or be tricked into) exporting arbitrary
      // filesystem content into raw/chats/.
      const abs = resolve(positional)
      if (!abs.startsWith(CLAUDE_PROJECTS_DIR + "/") || !abs.endsWith(".jsonl")) {
        process.stderr.write(
          `recall export: path "${positional}" must be a .jsonl file under ${CLAUDE_PROJECTS_DIR}/\n`,
        )
        process.exit(1)
      }
      jsonlPaths = [abs]
    } else {
      const found = findJsonlBySessionId(positional)
      if (!found) {
        process.stderr.write(`recall export: session "${positional}" not found under ${CLAUDE_PROJECTS_DIR}\n`)
        process.exit(1)
      }
      jsonlPaths = [found]
    }
  }

  let written = 0
  let skipped = 0
  let empty = 0
  for (const jsonlPath of jsonlPaths) {
    const meta = readSessionMeta(jsonlPath)
    if (!meta) {
      empty++
      continue
    }
    const outPath = join(SESSIONS_DIR, sessionFilename(meta))
    // Skip existing files unless one of:
    //   --force         explicit rewrite
    //   SessionEnd hook (--hook alone, without --catchup) — we want the
    //                   freshest snapshot of the session that just ended
    // --catchup mode always skips existing files; its whole job is to backfill
    // missing exports, not rewrite ones already on disk.
    const sessionEndOverwrite = isHook && !isCatchup
    if (existsSync(outPath) && !force && !sessionEndOverwrite) {
      skipped++
      continue
    }
    try {
      writeFileSync(outPath, renderSessionMarkdown(meta), "utf-8")
      written++
      if (!all && !isHook && !isCatchup) process.stderr.write(`exported: ${outPath}\n`)
    } catch (err) {
      // Don't crash the catchup / hook over one bad session — log and move on.
      process.stderr.write(`recall export: failed to write ${outPath}: ${(err as Error).message}\n`)
      empty++
    }
  }
  if (all) {
    process.stderr.write(
      `recall export: ${written} written, ${skipped} skipped (exists), ${empty} unreadable (of ${jsonlPaths.length} total)\n`,
    )
    if (written > 0) {
      process.stderr.write(`run \`recall index\` to refresh qmd's sessions collection\n`)
    }
  }
  // Catchup: stay silent unless we actually did work. When we did work, log
  // to stderr so SessionStart-hook output captures it in Claude Code's hook
  // log, and fire a background `qmd update` so the new exports become
  // searchable without user intervention.
  if (isCatchup) {
    if (written > 0) {
      process.stderr.write(`recall catchup: exported ${written} missing session(s); triggering qmd index\n`)
      // Fire-and-forget background reindex. We unref() + detach so catchup
      // returns immediately — the reindex may take seconds to minutes and
      // the user shouldn't wait on it.
      try {
        // Lazy import so non-catchup paths don't pay for this
        // biome-ignore lint: dynamic import is intentional
        const { spawn } = require("node:child_process") as typeof import("node:child_process")
        const child = spawn("qmd", ["update"], {
          stdio: "ignore",
          detached: true,
        })
        child.unref()
      } catch {
        // If qmd isn't installed or spawn fails, just skip — next manual
        // `recall index` will catch up.
      }
    }
  }
  if (isHook) {
    // Claude Code's SessionEnd validator doesn't accept hookSpecificOutput
    // for this event (see emitHookJson docs). Plain {} is the correct no-op.
    process.stdout.write(emitHookJson("SessionEnd"))
  }
}

/**
 * Build a valid Claude Code hook-response JSON blob.
 *
 * Routes through `@bearly/injection-envelope`'s `emitHookJson` — the
 * canonical implementation. Re-exported here so existing callers and tests
 * that import from `./recall.ts` keep working.
 *
 * Schema summary (enforced upstream):
 *   - **UserPromptSubmit** + additionalContext → full envelope
 *   - **UserPromptSubmit** with no context → plain `{}`
 *   - **SessionEnd** + anything else → plain `{}`
 */
export function emitHookJson(eventName: string, additionalContext?: string): string {
  return envelopeEmitHookJson(eventName, additionalContext)
}

// ── search ───────────────────────────────────────────────────────────────

/**
 * Run a qmd search. By default uses BM25 (`qmd search`) which is <200ms and
 * has no model dependencies — important for the UserPromptSubmit hook path
 * where latency + reliability matter more than semantic recall. Passing
 * `hybrid: true` falls back to the full hybrid pipeline (`qmd query`).
 */
function qmdQuery(
  query: string,
  opts: { limit?: number; json?: boolean; collection?: string; hybrid?: boolean } = {},
): string {
  const verb = opts.hybrid ? "query" : "search"
  const args = [verb, query]
  if (opts.limit) args.push("-n", String(opts.limit))
  if (opts.json) args.push("--json")
  if (opts.collection) args.push("-c", opts.collection)
  const res = spawnSync(QMD, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (res.status !== 0) {
    return opts.json ? "[]" : (res.stderr ?? "qmd: search failed")
  }
  return res.stdout
}

function cmdSearch(args: string[]): void {
  // Pull out flags, leaving positional terms as the query.
  const positional: string[] = []
  let limit = 10
  let collection: string | undefined
  let json = false
  let hybrid = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === "-n" || a === "--limit") {
      limit = parseInt(args[++i] ?? "10", 10) || 10
    } else if (a === "-c" || a === "--collection") {
      collection = args[++i]
    } else if (a === "--json") {
      json = true
    } else if (a === "--hybrid") {
      hybrid = true
    } else if (a.startsWith("-")) {
      process.stderr.write(`recall: unknown option "${a}"\n`)
      process.exit(2)
    } else {
      positional.push(a)
    }
  }
  const query = positional.join(" ").trim()
  if (!query) {
    process.stderr.write("usage: recall <query> [-n N] [-c collection] [--json] [--hybrid]\n")
    process.exit(2)
  }
  const out = qmdQuery(query, { limit, json, collection, hybrid })
  process.stdout.write(out)
  if (!out.endsWith("\n")) process.stdout.write("\n")
}

// ── hook ─────────────────────────────────────────────────────────────────

interface QmdHit {
  docid?: string
  score?: number
  file?: string
  title?: string
  context?: string
  snippet?: string
}

// NOTE: CONTEXT_PROTOCOL_FOOTER, IMPERATIVE_VERBS, and rewriteImperativeAsReported
// used to live here as phase-0 duct-tape ports from bearly/inject-core.ts. They
// now route through `@bearly/injection-envelope` — the single chokepoint that
// also side-effects the turn-manifest file consumed by the PreToolUse authority
// gate. See km-bearly.injection-envelope-lib (phase 2) and
// km-bearly.injection-gate-pretooluse (phase 1).

function cmdHook(): void {
  let raw = ""
  try {
    raw = readFileSync(0, "utf-8")
  } catch {
    /* no stdin — emit empty */
  }
  let input: { prompt?: string; session_id?: string } = {}
  try {
    input = JSON.parse(raw) as { prompt?: string; session_id?: string }
  } catch {
    /* ignore */
  }
  const prompt = (input.prompt ?? "").trim()
  // Skip short prompts and slash commands — no value in injecting memory.
  if (!prompt || prompt.length < 12 || prompt.startsWith("/")) {
    emitInjectionDebugEvent({
      source: "qmd",
      sessionId: input.session_id,
      action: "skip",
      reason: !prompt ? "empty" : prompt.startsWith("/") ? "slash_command" : "short",
      prompt: prompt.slice(0, 200),
    })
    process.stdout.write(envelopeEmitHookJson("UserPromptSubmit"))
    return
  }

  // BM25-only, no collection filter — qmd searches all configured collections.
  // Keeps the hook <200ms and avoids the LLM/Metal paths that can hang.
  // Request more than we'll show so we can dedupe (the vault collection's
  // glob currently picks up raw/chats/ too, producing duplicate hits).
  const out = qmdQuery(prompt, { limit: 8, json: true })
  let hits: QmdHit[] = []
  try {
    hits = JSON.parse(out) as QmdHit[]
  } catch {
    /* bad JSON = no hits */
  }
  if (hits.length === 0) {
    emitInjectionDebugEvent({
      source: "qmd",
      sessionId: input.session_id,
      action: "skip",
      reason: "no_results",
      prompt: prompt.slice(0, 200),
    })
    process.stdout.write(envelopeEmitHookJson("UserPromptSubmit"))
    return
  }

  // Dedupe by file basename — catches files indexed twice across overlapping
  // collections (e.g. sessions/ and vault/ both pick up raw/chats/*.md, and
  // vault/archive/ mirrors km/imports/).
  const seen = new Set<string>()
  const deduped = hits
    .filter((h) => {
      const path = h.file ?? ""
      const key = path.split("/").pop() ?? path
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)

  if (deduped.length === 0) {
    emitInjectionDebugEvent({
      source: "qmd",
      sessionId: input.session_id,
      action: "skip",
      reason: "all_dedup",
      prompt: prompt.slice(0, 200),
    })
    process.stdout.write(envelopeEmitHookJson("UserPromptSubmit"))
    return
  }

  // Route through the shared injection-envelope library. Defaults to
  // "pointer" mode (phase 3): pointer emission starves the attack of its
  // carrier (imperative-shaped body prose never lands in the user role).
  // Set INJECTION_MODE=snippet for the legacy body-inline behavior —
  // useful when the model is configured without retrieve_memory tool
  // access. Either way, the library handles: hardened wrapper, imperative
  // rewrite, sanitizer, trailing footer, and turn-manifest side effect.
  const mode = (process.env.INJECTION_MODE ?? "pointer") as "snippet" | "pointer"
  const items: InjectedItem[] = deduped.map((hit) => {
    const path = (hit.file ?? "").replace(/[^\w@./:+-]/g, "")
    const snippet = hit.snippet
      ? hit.snippet
          .replace(/@@ -\d+,?\d* @@ \([^)]*\)\s*/g, "") // strip qmd diff headers
          .replace(/\n+/g, " ")
      : undefined
    return {
      id: hit.docid ?? (path || undefined),
      title: hit.title ?? hit.file ?? "(untitled)",
      path: path || undefined,
      snippet,
      summary: hit.context,
    }
  })

  const additionalContext = envelopeWrap({
    source: "qmd",
    mode,
    items,
    sessionId: input.session_id,
    typedUserText: prompt,
  })

  process.stdout.write(envelopeEmitHookJson("UserPromptSubmit", additionalContext))
}

/**
 * Defense against indirect prompt injection via indexed past-session content.
 *
 * Routes through `@bearly/injection-envelope`'s `sanitize()` — the canonical
 * implementation. Kept as a named export for test compatibility and any
 * callers still importing `sanitizeForContext` from this module.
 */
export function sanitizeForContext(text: string, maxLen: number): string {
  return envelopeSanitize(text, maxLen)
}

// ── index / status / help ────────────────────────────────────────────────

function cmdIndex(): void {
  process.stderr.write("recall: running `qmd update`…\n")
  const res = spawnSync(QMD, ["update"], { stdio: "inherit" })
  process.exit(res.status ?? 1)
}

function cmdStatus(): void {
  const jsonlCount = listAllJsonlPaths().length
  const chatsCount = existsSync(SESSIONS_DIR) ? readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".md")).length : 0
  process.stdout.write(`recall status\n`)
  process.stdout.write(`  JSONL sessions on disk: ${jsonlCount}\n`)
  process.stdout.write(`  markdown chats exported: ${chatsCount}\n`)
  process.stdout.write(`  chats dir: ${SESSIONS_DIR}\n`)
  process.stdout.write(`\nqmd status:\n`)
  spawnSync(QMD, ["status"], { stdio: "inherit" })
}

function printHelp(): void {
  process.stderr.write(`recall — qmd-backed session memory

usage:
  recall <query> [-n N] [--json]                 search (default)
  recall export <session-id|jsonl-path>          export one session to markdown
  recall export --all [--force]                  bootstrap: export every session
  recall export --catchup [--hook]               silent: export missing sessions only
  recall hook                                    UserPromptSubmit hook (stdin JSON)
  recall export --hook                           SessionEnd hook (stdin JSON)
  recall index                                   run qmd update to refresh collections
  recall status                                  show counts + qmd status
  recall help                                    this message

export target: ${SESSIONS_DIR}

bootstrap / one-time:
  recall export --all          # write markdown for every session
  recall index                 # refresh qmd's sessions collection

self-healing via Claude Code hooks (~/.claude/settings.json):

  hooks.SessionStart:
    { "type": "command", "command": "recall export --catchup --hook" }
      # runs silently on every session start; exports any sessions that
      # were missed (e.g. SessionEnd hook crashed), fires background
      # qmd update if work was done

  hooks.SessionEnd:
    { "type": "command", "command": "recall export --hook" }
      # immediate export of the session that just ended

  hooks.UserPromptSubmit:
    { "type": "command", "command": "recall hook" }
      # injects qmd search hits as Session Memory

With all three hooks wired up, missed exports self-heal on the next
session start. No manual intervention needed; use \`recall export --all\`
only for a forced full rebuild.
`)
}

// ── dispatch ─────────────────────────────────────────────────────────────
// Gated on import.meta.main so the module can be imported by tests without
// executing the CLI side effects.

function main(): void {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    printHelp()
    process.exit(2)
  }
  switch (args[0]) {
    case "help":
    case "-h":
    case "--help":
      printHelp()
      process.exit(0)
      break
    case "export":
      cmdExport(args.slice(1))
      break
    case "hook":
      cmdHook()
      break
    case "index":
      cmdIndex()
      break
    case "status":
      cmdStatus()
      break
    default:
      cmdSearch(args)
      break
  }
}

if (import.meta.main) main()

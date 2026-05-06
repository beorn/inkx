/**
 * --resume backfill.
 *
 * When a session is spawned with `--resume <sessionId>`, Claude Code
 * reloads the prior context server-side from `~/.claude/projects/<proj>/
 * <sessionId>.jsonl`. But silvercode's UI store starts empty — the user
 * sees a blank block until they type something new.
 *
 * This module replays the on-disk JSONL through the same stream-json
 * parser the live harness uses, so the resumed session's history appears
 * in the block BEFORE any new live events arrive. The projdir name is
 * derived from the cwd by replacing slashes with dashes (Claude Code's
 * own convention for project namespacing).
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { AgentEvent, SessionStore } from "@km/agent-harness"
import { createStreamJsonParser } from "@km/agent-harness"
import { claudeProjectsRoot } from "@km/config/paths"
import { findCodexTranscript } from "./codex-resume.ts"

/**
 * Convert a project cwd to Claude's on-disk project-dir naming.
 * `/Users/beorn/Code/pim/km` → `-Users-beorn-Code-pim-km`.
 */
export function claudeProjDir(cwd: string): string {
  return cwd.replace(/\//g, "-")
}

/** Resolve the absolute path to a resumed session's JSONL transcript. */
export function sessionJsonlPath(cwd: string, sessionId: string): string {
  return join(claudeProjectsRoot(), claudeProjDir(cwd), `${sessionId}.jsonl`)
}

/**
 * Synthetic-id pattern from pre-849b4358d silvercode versions: when
 * `claude --bare -p` didn't yet emit a `session-init` event before
 * `newSession` returned, server.ts fell back to a synthesized id of the
 * form `claude-acp-<unix-millis>-<seq>`. Those ids reference no real
 * Claude Code transcript and will never resolve via `--resume`.
 *
 * Bead: km-silvercode.resume-blank-screen.
 */
const SYNTHETIC_ACP_ID_RE = /^claude-acp-\d{10,}-\d+$/

/**
 * Pre-flight check that runs BEFORE silvercode enters alt-screen mode.
 *
 * Returns `null` if the resume id is plausibly resolvable, or an error
 * message string to print to stderr and exit with non-zero code.
 *
 * Why pre-flight (not just in-store error events): once silvercode flips
 * the terminal into alt-screen, the user sees the empty UI but no error.
 * The runtime error path (claude subprocess writes "session not found"
 * to stderr → captured as `kind: "error"` event → set `state.lastError`)
 * never renders to pixels because no component subscribes to lastError.
 * A pre-flight failure prints to the user's normal terminal and exits
 * cleanly — no dangling alt-screen, no blank UI, clear actionable text.
 *
 * Scope:
 * - Synthetic `claude-acp-<ts>-<n>` ids — always rejected
 * - Claude-Code agents with missing JSONL — rejected
 * - Codex agents with missing rollout JSONL — rejected
 * - Other agents (gemini, copilot, pi-acp) — skipped (their transcript
 *   layouts differ and the in-process loadSession path already returns a
 *   clean error to the controller, which DOES surface as a stderr write via
 *   spawnSession's catch)
 */
export function validateResumeId(opts: { agent: string | undefined; sessionId: string; cwd: string }): string | null {
  const { agent, sessionId, cwd } = opts

  if (SYNTHETIC_ACP_ID_RE.test(sessionId)) {
    return (
      `silvercode: --resume ${sessionId} cannot be resolved.\n` +
      `This id was synthesized by an older silvercode version that didn't\n` +
      `wait for the real Claude session UUID. Older sessions cannot be\n` +
      `resumed by id; start a fresh session (omit --resume) and the new\n` +
      `session id will be a real UUID you can resume next time.\n`
    )
  }

  const isClaudeAgent =
    agent === undefined ||
    agent === "claude" ||
    agent === "claude-code" ||
    agent === "claude-code-spawn" ||
    agent === "claude-code-sdk"

  if (isClaudeAgent) {
    const path = sessionJsonlPath(cwd, sessionId)
    if (!existsSync(path)) {
      return (
        `silvercode: --resume ${sessionId} not found.\n` +
        `No transcript at ${path}.\n` +
        `Check ~/.claude/projects/${claudeProjDir(cwd)}/ for the right session id,\n` +
        `or omit --resume to start fresh.\n`
      )
    }
  }

  const isCodexAgent = agent === "codex" || agent === "codex-spawn"

  if (isCodexAgent && findCodexTranscript(sessionId) === null) {
    return (
      `silvercode: --resume ${sessionId} not found.\n` +
      `no codex transcript under ~/.codex/sessions/YYYY/MM/DD/rollout-*-${sessionId}.jsonl.\n` +
      `Check ~/.codex/sessions/ for the right session id, or omit --resume to start fresh.\n`
    )
  }

  return null
}

/**
 * Read the JSONL transcript, feed lines through the canonical stream-json
 * parser, and apply every resulting AgentEvent to `store`. Best-effort: a
 * malformed line surfaces as an error event (via the parser) but never
 * throws.
 *
 * Defensive contract: this function NEVER throws. A missing JSONL, an
 * empty file, an unreadable file, a corrupt line — all surface as a store
 * `error` event so the user sees an actionable message in the block, but
 * the App still mounts and the user can still type. The previous
 * fail-fast `throw` made the spawn promise reject; the controller's
 * `void spawnSession().catch(() => {})` then swallowed it and no session
 * was added to the list, leaving the user with a completely blank screen
 * (no block, no command box, no error). Bead:
 * `km-silvercode.resume-blank-screen`.
 *
 * Post-condition (when at least one user/assistant message replays):
 * status is left at `"idle"`. The on-disk JSONL contains `assistant` /
 * `user` / `tool_result` entries but NOT the live-stream events that
 * flip status back to idle (`message_delta` → turn-end, `result` →
 * session-end). A typical real transcript ends with a tool_result
 * followed by an assistant text block — tool-result sets status to
 * "thinking" and assistant-message doesn't change status, so without a
 * final reset the store's status would be stuck non-idle forever. Then
 * `controller.send()` would see non-idle and route every typed message
 * into the queue buffer indefinitely (the live turn-end that would
 * drain the queue never fires because the transcript is historical).
 * Symptom: command box appears to "do nothing" on Enter and the agent
 * never responds. Bead: `km-silvercode.resume-hangs-no-input`.
 *
 * The synthetic turn-end fires ONLY when at least one user/assistant
 * message was successfully replayed AND status is non-idle/non-ended.
 * This avoids appending a phantom empty assistant bubble for an empty
 * or system-only transcript (which would look weird in the block and
 * doesn't add information).
 */
export function replaySessionFromDisk(store: SessionStore, cwd: string, sessionId: string): void {
  const path = sessionJsonlPath(cwd, sessionId)
  if (!existsSync(path)) {
    store.apply({
      kind: "error",
      sessionId: sessionId as never,
      message:
        `--resume: no transcript at ${path}. ` +
        `Session "${sessionId}" doesn't exist for cwd ${cwd}. ` +
        `Check ~/.claude/projects/ for the right session id, or omit --resume to start fresh.`,
      ts: Date.now(),
    })
    return
  }
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch (err) {
    store.apply({
      kind: "error",
      sessionId: sessionId as never,
      message: `--resume: failed to read transcript at ${path}: ${(err as Error).message}`,
      ts: Date.now(),
    })
    return
  }
  const parser = createStreamJsonParser((event: AgentEvent) => {
    store.apply(event)
  })
  try {
    for (const line of raw.split("\n")) {
      if (line.length === 0) continue
      parser.push(line)
    }
  } catch (err) {
    // Defensive: parser is supposed to be robust (corrupt JSON → emits
    // error event), but any uncaught exception inside an event handler
    // would propagate up here. Swallow + report so the App still mounts.
    store.apply({
      kind: "error",
      sessionId: sessionId as never,
      message: `--resume: error replaying transcript: ${(err as Error).message}`,
      ts: Date.now(),
    })
    return
  }
  // Force status to "idle" via a synthetic turn-end. Only fires if at
  // least one user/assistant message was successfully replayed —
  // otherwise the JSONL was empty or system-only and there's nothing
  // to "end". Reuse the LAST replayed message's id as the turn id so
  // the session-store's turn-end handler upserts onto that existing
  // entry (just sets a stopReason) instead of appending a phantom
  // empty assistant bubble.
  const replayed = store.state.get()
  const hasReplayedMessage = replayed.messages.some((m) => m.role === "user" || m.role === "assistant")
  if (hasReplayedMessage && replayed.status !== "idle" && replayed.status !== "ended") {
    const last = replayed.messages[replayed.messages.length - 1]!
    const turnId = last.id as never
    try {
      store.apply({
        kind: "turn-end",
        sessionId: sessionId as never,
        turnId,
        stopReason: "end_turn",
        ts: Date.now(),
      })
    } catch (err) {
      store.apply({
        kind: "error",
        sessionId: sessionId as never,
        message: `--resume: failed to settle turn after replay: ${(err as Error).message}`,
        ts: Date.now(),
      })
    }
  }
}

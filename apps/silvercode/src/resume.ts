/**
 * --resume backfill.
 *
 * When a session is spawned with `--resume <sessionId>`, Claude Code
 * reloads the prior context server-side from `~/.claude/projects/<proj>/
 * <sessionId>.jsonl`. But silvercode's UI store starts empty — the user
 * sees a blank card until they type something new.
 *
 * This module replays the on-disk JSONL through the same stream-json
 * parser the live harness uses, so the resumed session's history appears
 * in the card BEFORE any new live events arrive. The projdir name is
 * derived from the cwd by replacing slashes with dashes (Claude Code's
 * own convention for project namespacing).
 */

import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { AgentEvent, SessionStore } from "@km/agent-harness"
import { createStreamJsonParser } from "@km/agent-harness"

/**
 * Convert a project cwd to Claude's on-disk project-dir naming.
 * `/Users/beorn/Code/pim/km` → `-Users-beorn-Code-pim-km`.
 */
export function claudeProjDir(cwd: string): string {
  return cwd.replace(/\//g, "-")
}

/** Resolve the absolute path to a resumed session's JSONL transcript. */
export function sessionJsonlPath(cwd: string, sessionId: string): string {
  return join(homedir(), ".claude", "projects", claudeProjDir(cwd), `${sessionId}.jsonl`)
}

/**
 * Read the JSONL transcript, feed lines through the canonical stream-json
 * parser, and apply every resulting AgentEvent to `store`. Best-effort: a
 * malformed line surfaces as an error event (via the parser) but never
 * throws.
 *
 * Post-condition: status is left at `"idle"`. The on-disk JSONL contains
 * `assistant` / `user` / `tool_result` entries but NOT the live-stream
 * events that flip status back to idle (`message_delta` → turn-end,
 * `result` → session-end). A typical real transcript ends with a
 * tool_result followed by an assistant text block — tool-result sets
 * status to "thinking" and assistant-message doesn't change status, so
 * without a final reset the store's status would be stuck non-idle
 * forever. Then `controller.send()` would see non-idle and route every
 * typed message into the queue buffer indefinitely (the live turn-end
 * that would drain the queue never fires because the transcript is
 * historical). Symptom: command box appears to "do nothing" on Enter and
 * the agent never responds. Bead: `km-silvercode.resume-hangs-no-input`.
 */
export function replaySessionFromDisk(store: SessionStore, cwd: string, sessionId: string): void {
  const path = sessionJsonlPath(cwd, sessionId)
  if (!existsSync(path)) {
    // principles.md: invariant violations throw. fail fast, fail loud.
    // A missing transcript on --resume is a caller bug (wrong session id
    // or wrong cwd), not a recoverable condition — replaying into an
    // empty store would spin up a session that looks identical to a
    // fresh spawn but with the wrong sessionId passed to claude's
    // --resume, which then prints its own 'session not found' to stderr
    // and continues with a phantom transcript. Abort upfront.
    throw new Error(
      `--resume: no transcript at ${path}. ` +
        `Session "${sessionId}" doesn't exist for cwd ${cwd}. ` +
        `Check ~/.claude/projects/ for the right session id, or omit --resume to start fresh.`,
    )
  }
  const raw = readFileSync(path, "utf8") // let real I/O errors propagate
  const parser = createStreamJsonParser((event: AgentEvent) => {
    store.apply(event)
  })
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue
    parser.push(line)
  }
  // Force status to "idle" via a synthetic turn-end. We reuse the LAST
  // replayed message's id as the turn id so the session-store's turn-end
  // handler upserts onto that existing entry (just sets a stopReason)
  // instead of appending a phantom empty assistant bubble. If there are
  // no messages at all (empty transcript) we fall back to a unique
  // synthetic id — the resulting empty bubble is benign and the file-
  // existence check above already guards against the common case.
  const replayed = store.state.get()
  if (replayed.status !== "idle" && replayed.status !== "ended") {
    const last = replayed.messages[replayed.messages.length - 1]
    const turnId = (last?.id ?? `resume-replay-end-${Date.now()}`) as never
    store.apply({
      kind: "turn-end",
      sessionId: sessionId as never,
      turnId,
      stopReason: "end_turn",
      ts: Date.now(),
    })
  }
}

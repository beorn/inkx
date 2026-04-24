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
 * throws. Returns true if the file existed and was read, false otherwise.
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
}

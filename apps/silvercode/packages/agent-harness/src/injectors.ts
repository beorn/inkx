/**
 * Injection pipeline — harness-level UserPromptSubmit equivalent.
 *
 * Every user message passes through a chain of injectors before being written
 * to the agent's stdin. When running with `--bare`, the user's own `.claude`
 * hooks don't fire inside the subprocess; this pipeline is where the harness
 * re-adds the context-injection that users expect (bd prime, active bead,
 * peer-session state, …).
 *
 * Injectors are pure functions: `(userText, ctx) → string | null`. Returning
 * `null` is equivalent to "no addition". Returned strings are appended below
 * the user's text wrapped in `<system-reminder>` blocks — the same framing
 * Claude Code uses for its own reminders.
 */

import type { SessionId } from "./events.ts"

export type InjectorContext = {
  sessionId: SessionId
  cwd: string
}

export type Injector = {
  readonly name: string
  run(userText: string, ctx: InjectorContext): string | null | Promise<string | null>
}

export function runInjectors(injectors: readonly Injector[], userText: string, ctx: InjectorContext): string {
  if (injectors.length === 0) return userText
  const additions: string[] = []
  for (const inj of injectors) {
    try {
      const out = inj.run(userText, ctx)
      // Only synchronous additions are merged into the immediate turn. Async
      // injectors resolve into a later turn via the harness; keep this sync
      // path simple for the common M3 cases (active bead, cwd, peers).
      if (typeof out === "string" && out.length > 0) additions.push(out)
    } catch {
      /* swallow — an injector must never block the user's message */
    }
  }
  if (additions.length === 0) return userText
  const reminders = additions.map((a) => `<system-reminder>\n${a}\n</system-reminder>`).join("\n")
  return `${userText}\n\n${reminders}`
}

/** Sample injector: active-bead + worktree context, sourced from bd. */
export function activeBeadInjector(getState: () => { beadId?: string; title?: string; worktree?: string }): Injector {
  return {
    name: "active-bead",
    run(): string | null {
      const s = getState()
      if (!s.beadId) return null
      const parts: string[] = [`Active bead: ${s.beadId}`]
      if (s.title) parts.push(`Title: ${s.title}`)
      if (s.worktree) parts.push(`Worktree: ${s.worktree}`)
      return parts.join("\n")
    },
  }
}

/** Sample injector: cwd + recent git activity, compact. */
export function cwdInjector(): Injector {
  return {
    name: "cwd",
    run(_text, ctx): string | null {
      return `cwd: ${ctx.cwd}`
    },
  }
}

/** Sample injector: channel-event digest (M4). */
export function channelDigestInjector(
  drain: (sessionId: SessionId) => Array<{ from: string; text: string }>,
): Injector {
  return {
    name: "channel-digest",
    run(_text, ctx): string | null {
      const msgs = drain(ctx.sessionId)
      if (msgs.length === 0) return null
      const lines = msgs.map((m) => `[channel from ${m.from}] ${m.text}`)
      return lines.join("\n")
    },
  }
}

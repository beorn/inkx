#!/usr/bin/env bun
/**
 * Probe script: replay a real session JSONL through the stream-json parser
 * + session store, then print what the UI would see. Not a vitest test —
 * a manual diagnostic for debugging --resume rendering.
 *
 * Usage:
 *   bun apps/silvercode/tests/probe-resume.ts <session-id>
 */

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createSessionStore, createStreamJsonParser } from "@km/agent-harness"

const sessionId = process.argv[2]
if (!sessionId) {
  console.error("usage: bun apps/silvercode/tests/probe-resume.ts <session-id>")
  process.exit(1)
}

const cwd = process.env.KM_CWD ?? "/Users/beorn/Code/pim/km"
const projDir = cwd.replace(/\//g, "-")
const path = join(homedir(), ".claude", "projects", projDir, `${sessionId}.jsonl`)

console.log(`[probe] reading ${path}`)
const raw = readFileSync(path, "utf8")
const lines = raw.split("\n").filter((l) => l.length > 0)
console.log(`[probe] ${lines.length} lines in file`)

const lineTypeCount = new Map<string, number>()
for (const l of lines) {
  try {
    const obj = JSON.parse(l) as { type?: string }
    lineTypeCount.set(obj.type ?? "?", (lineTypeCount.get(obj.type ?? "?") ?? 0) + 1)
  } catch {
    lineTypeCount.set("!parse-error", (lineTypeCount.get("!parse-error") ?? 0) + 1)
  }
}
console.log("[probe] line type breakdown:")
for (const [t, n] of [...lineTypeCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(24)} ${n}`)
}

const store = createSessionStore()
const events: string[] = []
const parser = createStreamJsonParser((e) => {
  events.push(e.kind)
  store.apply(e)
})
for (const l of lines) parser.push(l)

const eventTypeCount = new Map<string, number>()
for (const e of events) eventTypeCount.set(e, (eventTypeCount.get(e) ?? 0) + 1)
console.log(`\n[probe] emitted ${events.length} agent events:`)
for (const [t, n] of [...eventTypeCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(24)} ${n}`)
}

const state = store.state.get()
console.log(`\n[probe] final store state:`)
console.log(`  sessionId:          ${state.sessionId}`)
console.log(`  model:              ${state.model}`)
console.log(`  claudeCodeVersion:  ${state.claudeCodeVersion}`)
console.log(`  status:             ${state.status}`)
console.log(`  messages:           ${state.messages.length}`)
console.log(`  todos:              ${state.todos.length}`)
console.log(`  lastError:          ${state.lastError ?? "(none)"}`)

console.log(`\n[probe] first 3 messages:`)
for (const [i, m] of state.messages.slice(0, 3).entries()) {
  console.log(`  [${i}] role=${m.role} textLen=${m.text.length} toolCalls=${m.toolCalls.length} toolResults=${m.toolResults.length}`)
  console.log(`       text preview: ${JSON.stringify(m.text.slice(0, 140))}`)
}

console.log(`\n[probe] last 3 messages:`)
for (const [i, m] of state.messages.slice(-3).entries()) {
  const idx = state.messages.length - 3 + i
  console.log(`  [${idx}] role=${m.role} textLen=${m.text.length} toolCalls=${m.toolCalls.length} toolResults=${m.toolResults.length}`)
  console.log(`       text preview: ${JSON.stringify(m.text.slice(0, 140))}`)
}

// Look for suspicious patterns — duplicate text in consecutive messages.
let dupCount = 0
for (let i = 1; i < state.messages.length; i++) {
  const prev = state.messages[i - 1]!
  const curr = state.messages[i]!
  if (prev.text.length > 40 && prev.text === curr.text) dupCount++
}
console.log(`\n[probe] consecutive-duplicate-text messages: ${dupCount}`)

// Show any messages that contain raw XML-ish tags (channel / system-reminder / UserPromptSubmit).
const taggy = state.messages.filter((m) =>
  m.text.includes("<channel") || m.text.includes("<system-reminder") || m.text.includes("UserPromptSubmit hook"),
)
console.log(`[probe] messages containing raw system tags: ${taggy.length}`)
if (taggy.length > 0) {
  console.log(`       first taggy message text: ${JSON.stringify(taggy[0]!.text.slice(0, 200))}`)
}

#!/usr/bin/env bun
/**
 * bd-parent-hook — PreToolUse hook that auto-chains `bd update <id> --parent <prefix>`
 * after `bd create --id <prefix>.<suffix>` when no --parent is specified.
 *
 * Background: `bd create --id` and `--parent` cannot combine (bd quirk),
 * so the convention has been "two-step always": create, then update --parent.
 * The second step gets forgotten under load. The plateau-90 retro found 5+
 * beads parented to wrong epics or scope-backlogs because of this.
 *
 * Behavior:
 *   - Reads PreToolUse JSON from stdin
 *   - If tool is Bash and command matches `bd create --id <ID> ...` without `--parent`:
 *     - Extracts prefix from <ID>: km-silvery.foo → km-silvery, km-all.bar → km-all
 *     - Verifies the prefix exists as an epic via `bd show <prefix>`
 *     - If yes: rewrites command to chain `&& bd update <ID> --parent <prefix>`
 *     - If no: passes through (no inferred parent — leave as-is)
 *   - All other commands: pass through unchanged
 *
 * Output: Standard PreToolUse hook JSON. updatedInput rewrites the command;
 * permissionDecision: "allow" lets it run with the new command.
 *
 * Bead: km-all.bead-parent-discipline
 */

import { execSync } from "node:child_process"

interface PreToolUseInput {
  tool_name: string
  tool_input: { command?: string }
}

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse"
    permissionDecision?: "allow" | "deny" | "ask"
    permissionDecisionReason?: string
    updatedInput?: { command: string }
  }
  systemMessage?: string
  continue?: boolean
}

const passthrough: HookOutput = { continue: true }

async function read(): Promise<string> {
  let data = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) data += chunk
  return data
}

function emit(out: HookOutput): never {
  process.stdout.write(JSON.stringify(out))
  process.exit(0)
}

function epicExists(prefix: string): boolean {
  try {
    execSync(`bd show ${prefix}`, { stdio: "ignore", timeout: 2000 })
    return true
  } catch {
    return false
  }
}

// Parse `bd create --id <ID>` — capture the ID. Allow flags before/after.
// Stop at the first `&&`/`||`/`;`/`|` so we only inspect the first command.
function parseCreate(cmd: string): { id: string; rest: string; full: string } | null {
  const firstSegment = cmd.split(/\s*(?:&&|\|\||;|\|)\s*/)[0]
  if (!firstSegment) return null
  if (!/\bbd\s+create\b/.test(firstSegment)) return null
  if (/\B--parent\b/.test(firstSegment)) return null  // already parented

  const idMatch = firstSegment.match(/--id\s+(\S+)/)
  if (!idMatch?.[1]) return null
  return { id: idMatch[1], rest: firstSegment, full: cmd }
}

function inferPrefix(id: string): string | null {
  const dot = id.indexOf(".")
  if (dot < 0) return null  // ID is itself a top-level epic, no parent to add
  return id.slice(0, dot)
}

async function main(): Promise<void> {
  const raw = (await read()).trim()
  if (!raw) emit(passthrough)

  let parsed: PreToolUseInput
  try {
    parsed = JSON.parse(raw) as PreToolUseInput
  } catch {
    emit(passthrough)
  }

  if (parsed.tool_name !== "Bash") emit(passthrough)
  const cmd = parsed.tool_input.command
  if (!cmd) emit(passthrough)

  const create = parseCreate(cmd)
  if (!create) emit(passthrough)

  const prefix = inferPrefix(create.id)
  if (!prefix) emit(passthrough)

  if (!epicExists(prefix)) {
    // No epic by that prefix — emit a soft hint, don't rewrite.
    emit({
      continue: true,
      systemMessage: `bd-parent-hook: no epic '${prefix}' for bead ${create.id}. Consider creating the epic first or using a different ID prefix.`,
    })
  }

  // Auto-chain the parent assignment.
  const newCmd = `${cmd} && bd update ${create.id} --parent ${prefix}`
  emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: `bd-parent-hook: auto-chained --parent ${prefix} for ${create.id}`,
      updatedInput: { command: newCmd },
    },
  })
}

main()

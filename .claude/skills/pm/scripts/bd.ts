#!/usr/bin/env bun
/**
 * /bd - Beads Issue Tracker
 *
 * Unified interface for beads issue tracking with session coordination.
 *
 * Commands:
 *   (no args)        - Show dashboard (ready beads + active claims)
 *   ready            - Show actionable work (passthrough to bd ready)
 *   show <id>        - View bead details (passthrough to bd show)
 *   work <id>        - Start working: claim + show details
 *   claim <id>       - Claim bead for current session
 *   release [id]     - Release claim (or all if no id)
 *   close <id>       - Complete work (passthrough to bd close)
 *   sync             - Commit beads changes (passthrough to bd sync)
 *   my               - Show current session's claims
 *   gc               - Garbage collect expired claims (>2hr)
 *   whoami           - Show current session info
 */

import { execSync, spawnSync } from "child_process"
import { Glob } from "bun"
import * as path from "path"
import * as os from "os"
import * as fs from "fs"

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects")
const STALE_MINUTES = 30
const GC_MINUTES = 120

interface SessionInfo {
  sessionId: string
  shortId: string
  project: string
  lastActivity: Date
  inactiveMin: number
  expiresIn: number
  isStale: boolean
  isGarbage: boolean
}

interface BeadIssue {
  id: string
  title: string
  status: string
  priority: number
  assignee?: string
}

// ============================================================================
// Session Detection
// ============================================================================

function getCurrentSessionId(): string | null {
  // 1. Check environment variable (set by SessionStart hook)
  if (process.env.CLAUDE_SESSION_ID) {
    return process.env.CLAUDE_SESSION_ID
  }

  // 2. Find most recently modified session in current project
  const cwd = process.cwd()
  const encodedPath = cwd.replace(/\//g, "-")
  const projectDir = path.join(PROJECTS_DIR, encodedPath)

  if (!fs.existsSync(projectDir)) {
    return null
  }

  const sessions = fs
    .readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl") && !f.includes("sessions-index"))
    .map((f) => ({
      id: path.basename(f, ".jsonl"),
      mtime: fs.statSync(path.join(projectDir, f)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  // Return most recent if active within 5 minutes
  if (sessions[0] && Date.now() - sessions[0].mtime.getTime() < 5 * 60 * 1000) {
    return sessions[0].id
  }

  return null
}

function getSessionInfo(sessionId: string): SessionInfo | null {
  const glob = new Glob("*/sessions-index.json")

  for (const indexPath of glob.scanSync({
    cwd: PROJECTS_DIR,
    absolute: true,
  })) {
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"))
      const entry = index.entries?.find((e: { sessionId: string }) =>
        e.sessionId.startsWith(sessionId),
      )

      if (entry) {
        const lastActivity = new Date(entry.modified)
        const inactiveMin = (Date.now() - lastActivity.getTime()) / 60000
        const expiresIn = STALE_MINUTES - inactiveMin

        return {
          sessionId: entry.sessionId,
          shortId: entry.sessionId.slice(0, 8),
          project: path.basename(entry.projectPath || "unknown"),
          lastActivity,
          inactiveMin,
          expiresIn,
          isStale: inactiveMin > STALE_MINUTES,
          isGarbage: inactiveMin > GC_MINUTES,
        }
      }
    } catch {
      // Skip invalid index files
    }
  }

  return null
}

// ============================================================================
// Beads Integration
// ============================================================================

function runBd(args: string[]): string {
  try {
    return execSync(`bd ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string }
    throw new Error(error.stderr || error.message || "bd command failed")
  }
}

function runBdPassthrough(args: string[]): void {
  // Use spawnSync for passthrough to preserve output formatting
  const result = spawnSync("bd", args, {
    stdio: "inherit",
    encoding: "utf-8",
  })
  process.exit(result.status ?? 0)
}

function getReadyBeads(): BeadIssue[] {
  try {
    const output = runBd(["ready", "--json"])
    return JSON.parse(output || "[]")
  } catch {
    return []
  }
}

function getClaimedBeads(): BeadIssue[] {
  try {
    const output = runBd(["list", "--status", "in_progress", "--json"])
    const beads = JSON.parse(output || "[]")
    return beads.filter((b: BeadIssue) => b.assignee)
  } catch {
    return []
  }
}

function claimBead(beadId: string, sessionId: string): void {
  const shortId = sessionId.slice(0, 8)
  runBd(["update", beadId, "--status", "in_progress", "--assignee", shortId])
}

function releaseBead(beadId: string): void {
  runBd(["update", beadId, "--status", "open"])
}

// ============================================================================
// Formatting
// ============================================================================

function formatAge(minutes: number): string {
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${Math.floor(minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function formatExpiry(expiresIn: number): string {
  if (expiresIn > 0) {
    return `expires in ${Math.floor(expiresIn)}m`
  } else {
    return `EXPIRED ${Math.floor(-expiresIn)}m ago`
  }
}

// ============================================================================
// Commands
// ============================================================================

function cmdDashboard(currentSessionId: string | null): void {
  const shortId = currentSessionId?.slice(0, 8) || "unknown"
  const sessionInfo = currentSessionId ? getSessionInfo(currentSessionId) : null
  const project = sessionInfo?.project || path.basename(process.cwd())

  console.log(`Session: ${shortId} (${project})\n`)

  // Ready beads
  const ready = getReadyBeads()
  if (ready.length > 0) {
    console.log("READY (unclaimed):")
    for (const bead of ready.slice(0, 10)) {
      console.log(`  ${bead.id}  P${bead.priority}  "${bead.title}"`)
    }
    if (ready.length > 10) {
      console.log(`  ... and ${ready.length - 10} more`)
    }
    console.log()
  }

  // Claimed beads
  const claimed = getClaimedBeads()
  if (claimed.length > 0) {
    const staleCount = claimed.filter((b) => {
      const info = getSessionInfo(b.assignee!)
      return !info || info.isStale
    }).length

    console.log(
      `CLAIMED (${claimed.length - staleCount} active, ${staleCount} stale):`,
    )
    for (const bead of claimed) {
      const info = bead.assignee ? getSessionInfo(bead.assignee) : null
      const age = info ? formatAge(info.inactiveMin) : "unknown"
      const expiry = info ? formatExpiry(info.expiresIn) : "EXPIRED"
      const status = info?.isStale ? "STALE" : "ACTIVE"
      const isYou = bead.assignee === shortId ? " <- you" : ""

      console.log(
        `  ${bead.id}  ${bead.assignee || "?"}  "${bead.title}"  ${age}  ${expiry}  ${status}${isYou}`,
      )
    }
    console.log()
  } else {
    console.log("CLAIMED: (none)\n")
  }

  console.log(
    "Commands: /bd work <id>, /bd show <id>, /bd release, /bd close <id>",
  )
}

function cmdWork(beadId: string, currentSessionId: string): void {
  // First claim
  const shortId = currentSessionId.slice(0, 8)
  const claimed = getClaimedBeads()
  const existing = claimed.find((b) => b.id === beadId)

  if (existing?.assignee) {
    const info = getSessionInfo(existing.assignee)
    if (info && !info.isStale && existing.assignee !== shortId) {
      console.error(
        `Already claimed by ${existing.assignee} (active ${formatAge(info.inactiveMin)})`,
      )
      process.exit(1)
    }
    if (existing.assignee !== shortId) {
      // Stale - release first
      console.log(`Released stale claim (was ${existing.assignee})`)
      releaseBead(existing.id)
    }
  }

  if (existing?.assignee !== shortId) {
    claimBead(beadId, currentSessionId)
    console.log(`Claimed ${beadId} (expires in ${STALE_MINUTES}m)\n`)
  } else {
    console.log(`Already claimed by you\n`)
  }

  // Then show details
  runBdPassthrough(["show", beadId])
}

function cmdClaim(beadId: string, currentSessionId: string): void {
  // Check if already claimed
  const claimed = getClaimedBeads()
  const existing = claimed.find((b) => b.id === beadId)

  if (existing?.assignee) {
    const info = getSessionInfo(existing.assignee)
    if (info && !info.isStale) {
      const isYou = existing.assignee === currentSessionId.slice(0, 8)
      if (isYou) {
        console.log(
          `Already claimed by you (expires in ${Math.floor(info.expiresIn)}m)`,
        )
        return
      }
      console.error(
        `Already claimed by ${existing.assignee} (active ${formatAge(info.inactiveMin)})`,
      )
      process.exit(1)
    }
    // Stale - release first
    console.log(`Released stale claim (was ${existing.assignee})`)
    releaseBead(existing.id)
  }

  claimBead(beadId, currentSessionId)
  console.log(`Claimed ${beadId} (expires in ${STALE_MINUTES}m)`)
}

function cmdRelease(
  beadId: string | undefined,
  currentSessionId: string,
): void {
  const shortId = currentSessionId.slice(0, 8)

  if (beadId) {
    releaseBead(beadId)
    console.log(`Released ${beadId}`)
  } else {
    // Release all for current session
    const claimed = getClaimedBeads().filter((b) => b.assignee === shortId)
    if (claimed.length === 0) {
      console.log("No claims to release")
      return
    }
    for (const bead of claimed) {
      releaseBead(bead.id)
      console.log(`Released ${bead.id}`)
    }
  }
}

function cmdMy(currentSessionId: string): void {
  const shortId = currentSessionId.slice(0, 8)
  const claimed = getClaimedBeads().filter((b) => b.assignee === shortId)

  console.log(`MY CLAIMS (session ${shortId}):`)
  if (claimed.length === 0) {
    console.log("  (none)")
    return
  }

  const sessionInfo = getSessionInfo(currentSessionId)
  for (const bead of claimed) {
    const expiry = sessionInfo ? formatExpiry(sessionInfo.expiresIn) : "unknown"
    console.log(`  ${bead.id}  "${bead.title}"  ${expiry}`)
  }
}

function cmdGc(): void {
  const claimed = getClaimedBeads()
  const garbage: Array<{ bead: BeadIssue; info: SessionInfo | null }> = []

  for (const bead of claimed) {
    if (!bead.assignee) continue
    const info = getSessionInfo(bead.assignee)
    if (!info || info.isGarbage) {
      garbage.push({ bead, info })
    }
  }

  if (garbage.length === 0) {
    console.log("No garbage claims to collect")
    return
  }

  console.log(
    `Released ${garbage.length} garbage claims (>${GC_MINUTES / 60}hr stale):`,
  )
  for (const { bead, info } of garbage) {
    releaseBead(bead.id)
    const age = info ? formatAge(info.inactiveMin) : "session not found"
    console.log(`  ${bead.id}  ${bead.assignee}  ${age}`)
  }
}

function cmdWhoami(currentSessionId: string | null): void {
  if (!currentSessionId) {
    console.log("Session: unknown")
    console.log("\nTip: Set up SessionStart hook to export CLAUDE_SESSION_ID")
    return
  }

  const info = getSessionInfo(currentSessionId)
  console.log(`Session: ${currentSessionId.slice(0, 8)}`)
  console.log(`Full ID: ${currentSessionId}`)
  if (info) {
    console.log(`Project: ${info.project}`)
    console.log(`Last activity: ${formatAge(info.inactiveMin)}`)
    console.log(`Status: ${info.isStale ? "STALE" : "ACTIVE"}`)
  }
}

function printHelp(): void {
  console.log(`Usage: /bd [command] [args]

Commands:
  (no args)        Show dashboard (ready beads + active claims)
  ready            Show actionable work (no blockers)
  show <id>        View bead details
  work <id>        Start working: claim + show details
  claim <id>       Claim bead for current session
  release [id]     Release claim (or all if no id)
  close <id>       Complete work
  sync             Commit beads changes
  my               Show current session's claims
  gc               Garbage collect expired claims (>2hr)
  whoami           Show current session info
  help             Show this help`)
}

// ============================================================================
// Main
// ============================================================================

const [cmd, ...args] = process.argv.slice(2)
const currentSessionId = getCurrentSessionId()

switch (cmd) {
  case undefined:
  case "":
    cmdDashboard(currentSessionId)
    break

  // Passthrough commands
  case "ready":
    runBdPassthrough(["ready", ...args])
    break

  case "show":
    if (!args[0]) {
      console.error("Usage: /bd show <bead-id>")
      process.exit(1)
    }
    runBdPassthrough(["show", ...args])
    break

  case "close":
    if (!args[0]) {
      console.error("Usage: /bd close <bead-id>")
      process.exit(1)
    }
    runBdPassthrough(["close", ...args])
    break

  case "sync":
    runBdPassthrough(["sync", ...args])
    break

  // Session-aware commands
  case "work":
    if (!args[0]) {
      console.error("Usage: /bd work <bead-id>")
      process.exit(1)
    }
    if (!currentSessionId) {
      console.error("Cannot detect current session")
      process.exit(1)
    }
    cmdWork(args[0], currentSessionId)
    break

  case "claim":
    if (!args[0]) {
      console.error("Usage: /bd claim <bead-id>")
      process.exit(1)
    }
    if (!currentSessionId) {
      console.error("Cannot detect current session")
      process.exit(1)
    }
    cmdClaim(args[0], currentSessionId)
    break

  case "release":
    if (!currentSessionId) {
      console.error("Cannot detect current session")
      process.exit(1)
    }
    cmdRelease(args[0], currentSessionId)
    break

  case "my":
    if (!currentSessionId) {
      console.error("Cannot detect current session")
      process.exit(1)
    }
    cmdMy(currentSessionId)
    break

  case "gc":
    cmdGc()
    break

  case "whoami":
    cmdWhoami(currentSessionId)
    break

  case "help":
  case "--help":
  case "-h":
    printHelp()
    break

  default:
    // Check if it looks like a bead ID (starts with km-)
    if (cmd.startsWith("km-")) {
      // Treat as /bd work <id>
      if (!currentSessionId) {
        console.error("Cannot detect current session")
        process.exit(1)
      }
      cmdWork(cmd, currentSessionId)
    } else {
      console.error(`Unknown command: ${cmd}`)
      console.error('Run "/bd help" for usage')
      process.exit(1)
    }
    break
}

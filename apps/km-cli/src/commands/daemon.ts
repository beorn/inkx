/**
 * Daemon Command
 *
 * Manages the km daemon - a background process for sync and automation
 */

import { createLogger } from "loggily"
import { createServer, connect } from "net"
import type { Socket } from "net"

const log = createLogger("km:cli:daemon")
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, appendFileSync } from "fs"
import { join, dirname } from "path"
import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { Database } from "bun:sqlite"
import { createEmitter } from "@km/storage"
import { withSync } from "@km/fs-mount"
import { findKmRootFromPath } from "@km/fs-mount"
import type { Emitter } from "@km/storage"
import { type Sync, type SyncableRepo } from "@km/fs-mount"
import type { Change } from "@km/core"
import { EventEmitter } from "events"

// ============================================
// Main Export - Daemon Command
// ============================================

const daemonStartCommand = new Command("start")
  .description("Start the daemon in the background")
  .option("--foreground", "Run in foreground (don't daemonize)")
  .action(async (options: { foreground?: boolean }) => {
    const kmDir = findKmRootFromPath(process.cwd())
    if (!kmDir) {
      console.error(term.red("No .km directory found. Run 'km init' first."))
      process.exit(1)
    }
    const repoPath = dirname(kmDir)

    if (options.foreground) {
      // Run in foreground
      process.env.KM_DAEMON_FOREGROUND = "1"
      const daemon = new KmDaemon(repoPath, kmDir)
      await daemon.start()
    } else {
      // Check if already running
      const status = getDaemonStatus(kmDir)
      if (status.status === "running") {
        console.log(term.yellow("Daemon already running"), term.dim(`(PID: ${status.pid})`))
        return
      }

      // Spawn background process
      const cliPath = process.argv[1] ?? "km"
      const proc = Bun.spawn(["bun", "run", cliPath, "daemon", "start", "--foreground"], {
        cwd: repoPath,
        env: { ...process.env, KM_DIR: kmDir },
        stdio: ["ignore", "ignore", "ignore"],
      })

      // Detach and let it run
      proc.unref()

      // Wait a moment for it to start
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500)
      })

      // Check if it started
      const newStatus = getDaemonStatus(kmDir)
      if (newStatus.status === "running") {
        console.log(term.green("✓"), "Daemon started")
        console.log(term.dim(`PID: ${newStatus.pid}`))
      } else {
        console.error(term.red("✗"), "Failed to start daemon")
        console.log(term.dim("Check"), term.cyan(getDaemonPaths(kmDir).log), term.dim("for details"))
      }
    }
  })

const daemonStopCommand = new Command("stop").description("Stop the daemon").action(async () => {
  const kmDir = findKmRootFromPath(process.cwd())
  if (!kmDir) {
    console.error(term.red("No .km directory found."))
    process.exit(1)
  }
  const paths = getDaemonPaths(kmDir)
  const status = getDaemonStatus(kmDir)

  if (status.status === "stopped") {
    console.log(term.yellow("Daemon is not running"))
    return
  }

  // Try graceful shutdown via socket
  if (existsSync(paths.socket)) {
    try {
      await sendToDaemon(paths.socket, { type: "stop" })
      console.log(term.green("✓"), "Daemon stopping...")

      // Wait for it to stop
      for (let i = 0; i < 10; i++) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 500)
        })
        const newStatus = getDaemonStatus(kmDir)
        if (newStatus.status === "stopped") {
          console.log(term.green("✓"), "Daemon stopped")
          return
        }
      }

      console.log(term.yellow("Daemon taking too long to stop, sending SIGTERM..."))
    } catch {
      console.log(term.dim("Socket unavailable, sending SIGTERM..."))
    }
  }

  // Fall back to SIGTERM
  if (status.pid) {
    try {
      process.kill(status.pid, "SIGTERM")
      console.log(term.green("✓"), "Sent SIGTERM to daemon")
    } catch {
      console.log(term.yellow("Process not found, cleaning up..."))
    }
  }

  // Clean up files
  try {
    if (existsSync(paths.pid)) unlinkSync(paths.pid)
    if (existsSync(paths.socket)) unlinkSync(paths.socket)
  } catch {
    // Ignore cleanup errors
  }
})

const daemonStatusCommand = new Command("status").description("Show daemon status").action(async () => {
  const kmDir = findKmRootFromPath(process.cwd())
  if (!kmDir) {
    console.error(term.red("No .km directory found."))
    process.exit(1)
  }
  const paths = getDaemonPaths(kmDir)
  const basicStatus = getDaemonStatus(kmDir)

  console.log(term.bold("km daemon"))
  console.log()

  if (basicStatus.status === "stopped") {
    console.log("Status:", term.yellow("stopped"))
    return
  }

  // Try to get detailed status from socket
  if (existsSync(paths.socket)) {
    try {
      const response = await sendToDaemon(paths.socket, { type: "status" })
      if (response.ok && response.data) {
        const status = response.data as unknown as DaemonStatus
        console.log("Status:", term.green("running"))
        console.log("PID:", status.pid)
        console.log("Uptime:", formatUptime(status.uptime ?? 0))
        console.log("Socket:", paths.socket)
        console.log()
        console.log("Events processed:", status.eventsProcessed)
        console.log("Pending writes:", status.pendingWrites)
        console.log("Repo:", status.repoPath)
        return
      }
    } catch {
      // Fall through to basic status
    }
  }

  // Basic status (no socket connection)
  console.log("Status:", term.green("running"))
  console.log("PID:", basicStatus.pid)
  console.log("Socket:", term.dim("(unavailable)"))
})

export const daemonCommand = new Command("daemon")
  .description("Manage the km background daemon")
  .addCommand(daemonStartCommand)
  .addCommand(daemonStopCommand)
  .addCommand(daemonStatusCommand)

// ============================================
// Helper Types
// ============================================

/** Socket message types */
interface DaemonMessage {
  type: "status" | "sync" | "flush" | "stop" | "subscribe"
  data?: Record<string, unknown>
}

interface DaemonResponse {
  ok: boolean
  data?: Record<string, unknown>
  error?: string
}

interface DaemonStatus {
  status: "running" | "stopped"
  pid?: number
  uptime?: number
  startTime?: number
  eventsProcessed?: number
  pendingWrites?: number
  repoPath?: string
}

// ============================================
// Helper Functions
// ============================================

/** Daemon file paths */
function getDaemonPaths(kmDir: string) {
  return {
    pid: join(kmDir, "daemon.pid"),
    socket: join(kmDir, "km.sock"),
    log: join(kmDir, "daemon.log"),
  }
}

/**
 * Send a message to the daemon via socket
 */
async function sendToDaemon(socketPath: string, message: DaemonMessage): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath)
    let data = ""

    socket.on("connect", () => {
      socket.write(JSON.stringify(message))
    })

    socket.on("data", (chunk) => {
      data += chunk.toString()
      // Try to parse complete response
      if (data.includes("\n")) {
        try {
          const response = JSON.parse(data.trim()) as DaemonResponse
          socket.end()
          resolve(response)
        } catch {
          // Wait for more data
        }
      }
    })

    socket.on("error", (error) => {
      reject(error instanceof Error ? error : new Error(String(error)))
    })

    socket.on("close", () => {
      if (data) {
        try {
          resolve(JSON.parse(data.trim()) as DaemonResponse)
        } catch {
          reject(new Error("Invalid response from daemon"))
        }
      }
    })

    // Timeout after 5 seconds
    setTimeout(() => {
      socket.end()
      reject(new Error("Timeout waiting for daemon response"))
    }, 5000)
  })
}

/**
 * Get daemon status (without connecting)
 */
function getDaemonStatus(kmDir: string): DaemonStatus {
  const paths = getDaemonPaths(kmDir)

  if (!existsSync(paths.pid)) {
    return { status: "stopped" }
  }

  try {
    const pid = parseInt(readFileSync(paths.pid, "utf-8").trim(), 10)
    // Check if process is running
    process.kill(pid, 0)
    return { status: "running", pid }
  } catch {
    return { status: "stopped" }
  }
}

/**
 * Format uptime as human readable string
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

// ============================================
// KmDaemon Class
// ============================================

/**
 * KM Daemon - single background process for sync and automation
 */
class KmDaemon extends EventEmitter {
  private sync: Sync
  private emitter: Emitter
  private server?: ReturnType<typeof createServer>
  private startTime: number = 0
  private eventsProcessed: number = 0
  private subscribers: Set<Socket> = new Set()
  private paths: ReturnType<typeof getDaemonPaths>
  private repoPath: string

  constructor(repoPath: string, kmDir: string) {
    super()
    log.debug?.(`creating daemon for repo: ${repoPath}`)
    this.repoPath = repoPath
    this.paths = getDaemonPaths(kmDir)

    // Open database directly from kmDir
    const db = new Database(join(kmDir, "state.db"))

    // Create emitter for event handling
    this.emitter = createEmitter({ kmDir, db })

    const miniRepo: SyncableRepo = {
      database: db,
      path: repoPath,
      emitter: this.emitter,
      apply: (event, options?) => this.emitter.apply(event, options),
      commit: (event, options?) => this.emitter.commit(event, options),
    }

    this.sync = withSync({
      debounceFs: 5000,
      debounceApply: 3000,
      conflictStrategy: "last_write_wins",
      callbacks: {
        onStateChange: (state) => {
          this.log(`State: ${state}`)
        },
        onWriteComplete: (data) => {
          this.log(`Wrote ${data.count} file(s)`)
        },
        onError: (error) => {
          this.log(`Error: ${String(error)}`, "error")
        },
      },
    })(miniRepo)
  }

  /**
   * Log a message (to console in foreground, or log file in background)
   */
  private log(message: string, level: "info" | "error" = "info"): void {
    const timestamp = new Date().toISOString()
    const line = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`

    // Always log to file
    try {
      appendFileSync(this.paths.log, line)
    } catch {
      // Ignore log errors
    }

    // In foreground mode, also log to console
    if (process.env.KM_DAEMON_FOREGROUND) {
      if (level === "error") {
        console.error(term.red(message))
      } else {
        console.log(term.dim(message))
      }
    }
  }

  /**
   * Check if daemon is already running
   */
  isRunning(): boolean {
    if (!existsSync(this.paths.pid)) {
      return false
    }

    try {
      const pid = parseInt(readFileSync(this.paths.pid, "utf-8").trim(), 10)
      // Check if process is running
      process.kill(pid, 0)
      return true
    } catch {
      // PID file exists but process is dead - clean up
      this.cleanup()
      return false
    }
  }

  /**
   * Write PID file
   */
  private writePidFile(): void {
    writeFileSync(this.paths.pid, process.pid.toString())
  }

  /**
   * Clean up daemon files
   */
  private cleanup(): void {
    try {
      if (existsSync(this.paths.pid)) {
        unlinkSync(this.paths.pid)
      }
    } catch {
      // Ignore
    }

    try {
      if (existsSync(this.paths.socket)) {
        unlinkSync(this.paths.socket)
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Handle incoming socket connection
   */
  private handleConnection(socket: Socket): void {
    socket.on("data", (data) => {
      void (async () => {
        try {
          const msg = JSON.parse(data.toString()) as DaemonMessage
          const response = await this.handleMessage(msg, socket)
          socket.write(JSON.stringify(response) + "\n")
        } catch (error) {
          const err = error as Error
          socket.write(JSON.stringify({ ok: false, error: err.message }) + "\n")
        }
      })()
    })

    socket.on("close", () => {
      this.subscribers.delete(socket)
    })
  }

  /**
   * Handle a daemon message
   */
  private async handleMessage(msg: DaemonMessage, socket: Socket): Promise<DaemonResponse> {
    switch (msg.type) {
      case "status":
        return {
          ok: true,
          data: this.getStatus() as unknown as Record<string, unknown>,
        }

      case "sync":
        try {
          await this.sync.syncFromFs()
          return { ok: true }
        } catch (error) {
          return { ok: false, error: (error as Error).message }
        }

      case "flush":
        // Force flush pending writes
        return { ok: true }

      case "subscribe":
        this.subscribers.add(socket)
        return { ok: true, data: { subscribed: true } }

      case "stop":
        // Stop will be handled after response is sent
        setTimeout(() => void this.stop(), 100)
        return { ok: true, data: { stopping: true } }
    }
  }

  /**
   * Broadcast an event to all subscribers
   */
  private broadcast(event: Change): void {
    this.eventsProcessed++
    const data = JSON.stringify({ type: "event", event }) + "\n"
    for (const socket of this.subscribers) {
      try {
        socket.write(data)
      } catch {
        this.subscribers.delete(socket)
      }
    }
  }

  /**
   * Get daemon status
   */
  private getStatus(): DaemonStatus {
    return {
      status: "running",
      pid: process.pid,
      uptime: Date.now() - this.startTime,
      startTime: this.startTime,
      eventsProcessed: this.eventsProcessed,
      pendingWrites: this.sync.getStatus().pendingWrites,
      repoPath: this.repoPath,
    }
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    log.debug?.("start: checking for existing daemon")
    // Check for existing daemon
    if (this.isRunning()) {
      throw new Error("Daemon already running")
    }

    // Write PID file
    this.writePidFile()
    this.startTime = Date.now()

    // Ensure socket directory exists
    mkdirSync(dirname(this.paths.socket), { recursive: true })

    // Clean up any stale socket
    if (existsSync(this.paths.socket)) {
      unlinkSync(this.paths.socket)
    }

    // Create Unix socket server
    this.server = createServer((socket) => this.handleConnection(socket))
    this.server.listen(this.paths.socket)

    // Set up event hub for broadcasting
    this.emitter.setChangeHub({ broadcast: (event) => this.broadcast(event) })

    // Note: withSync() wraps repo.apply() to add FS projection

    // Startup sweep - sync filesystem
    this.log("Starting filesystem sync...")
    try {
      await this.sync.syncFromFs()
      this.log("Initial sync complete")
    } catch (error) {
      this.log(`Sync error: ${(error as Error).message}`, "error")
    }

    // Start file watching
    this.sync.start()
    log.debug?.(`start: daemon running, pid=${process.pid}`)
    this.log(`Daemon started, watching: ${this.repoPath}`)

    // Handle shutdown signals
    process.on("SIGINT", () => void this.stop())
    process.on("SIGTERM", () => void this.stop())
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    log.debug?.("stop: shutting down")
    this.log("Stopping daemon...")

    // Stop sync
    await this.sync.stop()

    // Close all subscriber connections
    for (const socket of this.subscribers) {
      socket.end()
    }
    this.subscribers.clear()

    // Close server
    if (this.server) {
      this.server.close()
      this.server = undefined
    }

    // Clean up files
    this.cleanup()

    this.log("Daemon stopped")

    // Exit process
    process.exit(0)
  }
}

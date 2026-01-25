#!/usr/bin/env bun
/**
 * Claude Session - Utilities for working with Claude Code session files
 *
 * Commands:
 *   list                 - List all sessions
 *   show <session-id>    - Show session details
 *   index                - Build/rebuild file write index
 *   search <pattern>     - Search indexed writes by file path
 *   grep <pattern>       - Search ALL session content (conversations, code, etc.)
 *   writes [--date D]    - List recent writes
 *   restore <file-path>  - Restore file content from session
 *   stats                - Show index statistics
 */

import { Database } from "bun:sqlite"
import { createHash } from "crypto"
import { Glob } from "bun"
import * as path from "path"
import * as os from "os"
import * as readline from "readline"
import * as fs from "fs"

const DB_PATH = path.join(os.homedir(), ".claude", "session-index.db")
const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects")
const MAX_CONTENT_SIZE = 1024 * 1024 // 1MB - store content for files smaller than this

const SCHEMA = `
CREATE TABLE IF NOT EXISTS writes (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  session_file TEXT NOT NULL,
  tool_use_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_size INTEGER NOT NULL,
  content TEXT
);

CREATE INDEX IF NOT EXISTS idx_writes_path ON writes(file_path);
CREATE INDEX IF NOT EXISTS idx_writes_timestamp ON writes(timestamp);
CREATE INDEX IF NOT EXISTS idx_writes_session ON writes(session_id);
CREATE INDEX IF NOT EXISTS idx_writes_hash ON writes(content_hash);

CREATE TABLE IF NOT EXISTS index_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

interface WriteRecord {
  id: number
  session_id: string
  session_file: string
  tool_use_id: string
  timestamp: string
  file_path: string
  content_hash: string
  content_size: number
  content: string | null
}

interface ToolUse {
  type: "tool_use"
  id: string
  name: string
  input: {
    file_path?: string
    content?: string
  }
}

interface SessionRecord {
  type: string
  sessionId?: string
  timestamp?: string
  message?: {
    content?: (ToolUse | { type: string })[]
  }
}

function getDb(): Database {
  const db = new Database(DB_PATH)
  db.exec(SCHEMA)
  return db
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16)
}

async function* findSessionFiles(): AsyncGenerator<string> {
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.error(`Projects directory not found: ${PROJECTS_DIR}`)
    return
  }

  const glob = new Glob("**/*.jsonl")
  for await (const file of glob.scan({ cwd: PROJECTS_DIR, absolute: true })) {
    yield file
  }
}

async function parseSessionFile(
  filePath: string,
  onWrite: (write: {
    sessionId: string
    toolUseId: string
    timestamp: string
    filePath: string
    content: string
  }) => void,
): Promise<number> {
  const fileStream = fs.createReadStream(filePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })

  let writeCount = 0

  for await (const line of rl) {
    if (!line.trim()) continue

    try {
      const record: SessionRecord = JSON.parse(line)

      if (record.type !== "assistant" || !record.message?.content) continue

      const sessionId = record.sessionId || path.basename(filePath, ".jsonl")
      const timestamp = record.timestamp || new Date().toISOString()

      for (const item of record.message.content) {
        if (
          item.type === "tool_use" &&
          (item as ToolUse).name === "Write" &&
          (item as ToolUse).input?.file_path &&
          (item as ToolUse).input?.content
        ) {
          const toolUse = item as ToolUse
          onWrite({
            sessionId,
            toolUseId: toolUse.id,
            timestamp,
            filePath: toolUse.input.file_path!,
            content: toolUse.input.content!,
          })
          writeCount++
        }
      }
    } catch {
      // Skip malformed JSON lines
    }
  }

  return writeCount
}

interface SessionInfo {
  file: string
  sessionId: string
  project: string
  size: number
  mtime: Date
  messageCount: number
  firstTimestamp?: string
  lastTimestamp?: string
}

async function getSessionInfo(filePath: string): Promise<SessionInfo> {
  const stats = fs.statSync(filePath)
  const relativePath = path.relative(PROJECTS_DIR, filePath)
  const project = relativePath.split(path.sep)[0] || "unknown"

  let messageCount = 0
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined
  let sessionId = path.basename(filePath, ".jsonl")

  const fileStream = fs.createReadStream(filePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      if (record.sessionId) sessionId = record.sessionId
      if (record.timestamp) {
        if (!firstTimestamp) firstTimestamp = record.timestamp
        lastTimestamp = record.timestamp
      }
      if (record.type === "assistant" || record.type === "user") {
        messageCount++
      }
    } catch {
      // Skip malformed lines
    }
  }

  return {
    file: relativePath,
    sessionId,
    project,
    size: stats.size,
    mtime: stats.mtime,
    messageCount,
    firstTimestamp,
    lastTimestamp,
  }
}

async function cmdList(projectFilter?: string): Promise<void> {
  console.log("Scanning sessions...\n")

  const sessions: SessionInfo[] = []

  for await (const sessionFile of findSessionFiles()) {
    const relativePath = path.relative(PROJECTS_DIR, sessionFile)
    const project = relativePath.split(path.sep)[0] || ""

    if (
      projectFilter &&
      !project.toLowerCase().includes(projectFilter.toLowerCase())
    ) {
      continue
    }

    const stats = fs.statSync(sessionFile)
    sessions.push({
      file: relativePath,
      sessionId: path.basename(sessionFile, ".jsonl"),
      project,
      size: stats.size,
      mtime: stats.mtime,
      messageCount: 0, // Skip counting for list (too slow)
      firstTimestamp: undefined,
      lastTimestamp: undefined,
    })
  }

  // Sort by modification time, newest first
  sessions.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  // Group by project
  const byProject = new Map<string, SessionInfo[]>()
  for (const s of sessions) {
    const existing = byProject.get(s.project) || []
    existing.push(s)
    byProject.set(s.project, existing)
  }

  for (const [project, projectSessions] of byProject) {
    const displayProject = project.replace(/-/g, "/").replace(/^-/, "/")
    console.log(`📁 ${displayProject}`)
    for (const s of projectSessions.slice(0, 10)) {
      const date = s.mtime.toLocaleString()
      const size = formatBytes(s.size)
      const id = s.sessionId.slice(0, 8)
      console.log(`   ${date}  ${size.padStart(8)}  ${id}...`)
    }
    if (projectSessions.length > 10) {
      console.log(`   ... and ${projectSessions.length - 10} more sessions`)
    }
    console.log()
  }

  console.log(
    `Total: ${sessions.length} sessions across ${byProject.size} projects`,
  )
}

async function cmdShow(sessionIdOrFile: string): Promise<void> {
  // Find session file
  let sessionFile: string | undefined

  for await (const file of findSessionFiles()) {
    const basename = path.basename(file, ".jsonl")
    if (
      basename.startsWith(sessionIdOrFile) ||
      file.includes(sessionIdOrFile)
    ) {
      sessionFile = file
      break
    }
  }

  if (!sessionFile) {
    console.error(`Session not found: ${sessionIdOrFile}`)
    process.exit(1)
  }

  console.log(`Session: ${path.relative(PROJECTS_DIR, sessionFile)}\n`)

  const info = await getSessionInfo(sessionFile)

  console.log(`Session ID:    ${info.sessionId}`)
  console.log(
    `Project:       ${info.project.replace(/-/g, "/").replace(/^-/, "/")}`,
  )
  console.log(`Size:          ${formatBytes(info.size)}`)
  console.log(`Messages:      ${info.messageCount}`)
  if (info.firstTimestamp) {
    console.log(
      `Started:       ${new Date(info.firstTimestamp).toLocaleString()}`,
    )
  }
  if (info.lastTimestamp) {
    console.log(
      `Last activity: ${new Date(info.lastTimestamp).toLocaleString()}`,
    )
  }

  // Show file writes in this session
  const db = getDb()
  const writes = db
    .prepare(
      "SELECT file_path, timestamp, content_size FROM writes WHERE session_id = ? ORDER BY timestamp",
    )
    .all(info.sessionId) as {
    file_path: string
    timestamp: string
    content_size: number
  }[]

  if (writes.length > 0) {
    console.log(`\nFile writes (${writes.length}):`)
    for (const w of writes.slice(0, 20)) {
      const time = new Date(w.timestamp).toLocaleTimeString()
      const size = formatBytes(w.content_size)
      const shortPath = w.file_path.replace(os.homedir(), "~")
      console.log(`  ${time}  ${size.padStart(8)}  ${shortPath}`)
    }
    if (writes.length > 20) {
      console.log(`  ... and ${writes.length - 20} more writes`)
    }
  }

  db.close()
}

async function cmdIndex(): Promise<void> {
  console.log("Building session index...")

  const db = getDb()

  // Clear existing data
  db.exec("DELETE FROM writes")
  db.exec("DELETE FROM index_meta")

  const insertStmt = db.prepare(`
    INSERT INTO writes (session_id, session_file, tool_use_id, timestamp, file_path, content_hash, content_size, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let totalWrites = 0
  let totalFiles = 0
  const seenHashes = new Set<string>()

  for await (const sessionFile of findSessionFiles()) {
    totalFiles++
    const relativePath = path.relative(PROJECTS_DIR, sessionFile)
    process.stdout.write(
      `\rProcessing: ${relativePath.slice(0, 60).padEnd(60)}`,
    )

    const writes = await parseSessionFile(sessionFile, (write) => {
      const hash = hashContent(write.content)
      const contentSize = Buffer.byteLength(write.content, "utf8")

      // Skip exact duplicates (same hash already seen)
      const uniqueKey = `${write.filePath}:${hash}`
      if (seenHashes.has(uniqueKey)) return
      seenHashes.add(uniqueKey)

      insertStmt.run(
        write.sessionId,
        relativePath,
        write.toolUseId,
        write.timestamp,
        write.filePath,
        hash,
        contentSize,
        contentSize <= MAX_CONTENT_SIZE ? write.content : null,
      )
      totalWrites++
    })
  }

  // Store metadata
  db.prepare(
    "INSERT OR REPLACE INTO index_meta (key, value) VALUES (?, ?)",
  ).run("last_rebuild", new Date().toISOString())
  db.prepare(
    "INSERT OR REPLACE INTO index_meta (key, value) VALUES (?, ?)",
  ).run("total_files", String(totalFiles))

  console.log(
    `\n\nIndexed ${totalWrites} unique writes from ${totalFiles} session files`,
  )
  db.close()
}

async function cmdSearch(pattern: string): Promise<void> {
  const db = getDb()

  // Convert glob pattern to SQL LIKE pattern
  const sqlPattern = pattern
    .replace(/\*\*/g, "%")
    .replace(/\*/g, "%")
    .replace(/\?/g, "_")

  const rows = db
    .prepare(
      `
    SELECT file_path, timestamp, content_hash, content_size, session_id
    FROM writes
    WHERE file_path LIKE ?
    ORDER BY timestamp DESC
  `,
    )
    .all(`%${sqlPattern}%`) as WriteRecord[]

  if (rows.length === 0) {
    console.log(`No writes found matching: ${pattern}`)
    return
  }

  console.log(`Found ${rows.length} writes matching "${pattern}":\n`)

  // Group by file path
  const byPath = new Map<string, WriteRecord[]>()
  for (const row of rows) {
    const existing = byPath.get(row.file_path) || []
    existing.push(row)
    byPath.set(row.file_path, existing)
  }

  for (const [filePath, versions] of byPath) {
    console.log(`📄 ${filePath}`)
    for (const v of versions.slice(0, 5)) {
      // Show up to 5 versions
      const date = new Date(v.timestamp).toLocaleString()
      const size = formatBytes(v.content_size)
      console.log(
        `   ${date}  ${size}  [${v.content_hash}]  session:${v.session_id.slice(0, 8)}`,
      )
    }
    if (versions.length > 5) {
      console.log(`   ... and ${versions.length - 5} more versions`)
    }
    console.log()
  }

  db.close()
}

async function cmdWrites(dateFilter?: string): Promise<void> {
  const db = getDb()

  let query = `
    SELECT file_path, timestamp, content_hash, content_size, session_id
    FROM writes
  `
  const params: string[] = []

  if (dateFilter) {
    query += ` WHERE timestamp LIKE ?`
    params.push(`${dateFilter}%`)
  }

  query += ` ORDER BY timestamp DESC LIMIT 100`

  const rows = db.prepare(query).all(...params) as WriteRecord[]

  if (rows.length === 0) {
    console.log(
      dateFilter
        ? `No writes found for date: ${dateFilter}`
        : "No writes found",
    )
    return
  }

  console.log(`Recent writes${dateFilter ? ` on ${dateFilter}` : ""}:\n`)

  for (const row of rows) {
    const date = new Date(row.timestamp).toLocaleString()
    const size = formatBytes(row.content_size)
    const shortPath = row.file_path.replace(os.homedir(), "~")
    console.log(`${date}  ${size.padStart(8)}  ${shortPath}`)
  }

  if (rows.length === 100) {
    console.log("\n(showing first 100 results)")
  }

  db.close()
}

async function cmdRestore(filePath: string, sessionId?: string): Promise<void> {
  const db = getDb()

  let query = `
    SELECT * FROM writes
    WHERE file_path LIKE ?
  `
  const params: string[] = [`%${filePath}`]

  if (sessionId) {
    query += ` AND session_id LIKE ?`
    params.push(`${sessionId}%`)
  }

  query += ` ORDER BY timestamp DESC`

  const rows = db.prepare(query).all(...params) as WriteRecord[]

  if (rows.length === 0) {
    console.log(`No writes found for: ${filePath}`)
    db.close()
    return
  }

  const firstRow = rows[0]! // Safe: checked rows.length > 0 above
  if (rows.length === 1 || firstRow.content) {
    // Single result or has content - show it
    if (firstRow.content) {
      console.log(`// File: ${firstRow.file_path}`)
      console.log(
        `// Written: ${new Date(firstRow.timestamp).toLocaleString()}`,
      )
      console.log(`// Session: ${firstRow.session_id}`)
      console.log(`// Hash: ${firstRow.content_hash}`)
      console.log(`// Size: ${formatBytes(firstRow.content_size)}`)
      console.log("// " + "=".repeat(70))
      console.log(firstRow.content)
    } else {
      console.log(
        `Content not stored (file was ${formatBytes(firstRow.content_size)}, exceeds 1MB limit)`,
      )
      console.log(`Session file: ${firstRow.session_file}`)
      console.log(`Tool use ID: ${firstRow.tool_use_id}`)
      console.log(
        "\nTo extract manually, search the session file for the tool_use_id",
      )
    }
  } else {
    // Multiple results - show list
    console.log(
      `Found ${rows.length} versions of files matching "${filePath}":\n`,
    )

    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i]! // Safe: i < rows.length
      const date = new Date(row.timestamp).toLocaleString()
      const hasContent = row.content ? "✓" : "✗"
      console.log(
        `${i + 1}. ${date}  [${row.content_hash}]  ${hasContent}content  session:${row.session_id.slice(0, 8)}`,
      )
      if (row.file_path !== filePath) {
        console.log(`   ${row.file_path}`)
      }
    }

    console.log("\nTo restore a specific version, use:")
    console.log(
      `  bun ./scripts/claude-session.ts restore "${firstRow.file_path}" --session <session-id>`,
    )
  }

  db.close()
}

async function cmdStats(): Promise<void> {
  const db = getDb()

  const totalWrites = (
    db.prepare("SELECT COUNT(*) as count FROM writes").get() as {
      count: number
    }
  ).count
  const uniqueFiles = (
    db
      .prepare("SELECT COUNT(DISTINCT file_path) as count FROM writes")
      .get() as { count: number }
  ).count
  const uniqueSessions = (
    db
      .prepare("SELECT COUNT(DISTINCT session_id) as count FROM writes")
      .get() as { count: number }
  ).count
  const totalSize = (
    db.prepare("SELECT SUM(content_size) as total FROM writes").get() as {
      total: number
    }
  ).total
  const storedContent = (
    db
      .prepare("SELECT COUNT(*) as count FROM writes WHERE content IS NOT NULL")
      .get() as { count: number }
  ).count

  const lastRebuild = db
    .prepare("SELECT value FROM index_meta WHERE key = 'last_rebuild'")
    .get() as { value: string } | undefined

  console.log("Session Index Statistics\n")
  console.log(`Total writes indexed:    ${totalWrites.toLocaleString()}`)
  console.log(`Unique files:            ${uniqueFiles.toLocaleString()}`)
  console.log(`Unique sessions:         ${uniqueSessions.toLocaleString()}`)
  console.log(`Total content written:   ${formatBytes(totalSize || 0)}`)
  console.log(
    `Writes with content:     ${storedContent.toLocaleString()} (${((storedContent / totalWrites) * 100).toFixed(1)}%)`,
  )
  console.log(
    `Last rebuild:            ${lastRebuild ? new Date(lastRebuild.value).toLocaleString() : "never"}`,
  )
  console.log(`Database location:       ${DB_PATH}`)

  // Top 10 most written files
  const topFiles = db
    .prepare(
      `
    SELECT file_path, COUNT(*) as count
    FROM writes
    GROUP BY file_path
    ORDER BY count DESC
    LIMIT 10
  `,
    )
    .all() as { file_path: string; count: number }[]

  if (topFiles.length > 0) {
    console.log("\nMost frequently written files:")
    for (const f of topFiles) {
      const shortPath = f.file_path.replace(os.homedir(), "~")
      console.log(`  ${f.count.toString().padStart(4)}x  ${shortPath}`)
    }
  }

  db.close()
}

interface GrepMatch {
  sessionFile: string
  sessionId: string
  timestamp: string
  type: string // "user" | "assistant"
  lineNumber: number
  context: string // Surrounding text
  matchLine: string // The actual matching line
}

async function cmdGrep(
  pattern: string,
  options: { project?: string; limit?: number; context?: number },
): Promise<void> {
  const { project, limit = 50, context: contextLines = 2 } = options

  console.log(`Searching for "${pattern}" in session content...\n`)

  const regex = new RegExp(pattern, "i")
  const matches: GrepMatch[] = []
  let filesSearched = 0

  for await (const sessionFile of findSessionFiles()) {
    const relativePath = path.relative(PROJECTS_DIR, sessionFile)
    const projectName = relativePath.split(path.sep)[0] || ""

    // Filter by project if specified
    if (project && !projectName.toLowerCase().includes(project.toLowerCase())) {
      continue
    }

    filesSearched++

    const fileContent = fs.readFileSync(sessionFile, "utf8")
    const lines = fileContent.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line?.trim()) continue

      try {
        const record = JSON.parse(line)

        // Extract text content from the record
        const textContent = extractTextContent(record)
        if (!textContent) continue

        // Check if pattern matches
        if (!regex.test(textContent)) continue

        // Find the matching lines within the content
        const contentLines = textContent.split("\n")
        for (let j = 0; j < contentLines.length; j++) {
          const contentLine = contentLines[j]
          if (!contentLine || !regex.test(contentLine)) continue

          // Get surrounding context
          const startIdx = Math.max(0, j - contextLines)
          const endIdx = Math.min(contentLines.length, j + contextLines + 1)
          const contextText = contentLines.slice(startIdx, endIdx).join("\n")

          matches.push({
            sessionFile: relativePath,
            sessionId: record.sessionId || path.basename(sessionFile, ".jsonl"),
            timestamp: record.timestamp || "",
            type: record.type || "unknown",
            lineNumber: j + 1,
            context: contextText,
            matchLine: contentLine,
          })

          if (matches.length >= limit) break
        }

        if (matches.length >= limit) break
      } catch {
        // Skip malformed JSON
      }
    }

    if (matches.length >= limit) break
  }

  if (matches.length === 0) {
    console.log(
      `No matches found for "${pattern}" in ${filesSearched} session files.`,
    )
    return
  }

  console.log(`Found ${matches.length} matches in ${filesSearched} files:\n`)

  // Group by session for cleaner output
  const bySession = new Map<string, GrepMatch[]>()
  for (const match of matches) {
    const key = match.sessionId
    const existing = bySession.get(key) || []
    existing.push(match)
    bySession.set(key, existing)
  }

  for (const [sessionId, sessionMatches] of bySession) {
    const firstMatch = sessionMatches[0]!
    const displayProject =
      firstMatch.sessionFile
        .split(path.sep)[0]
        ?.replace(/-/g, "/")
        .replace(/^-/, "/") || ""
    const date = firstMatch.timestamp
      ? new Date(firstMatch.timestamp).toLocaleDateString()
      : "unknown date"

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(
      `📁 Session: ${sessionId.slice(0, 12)}...  |  Project: ${displayProject}  |  ${date}`,
    )
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    for (const match of sessionMatches.slice(0, 5)) {
      const time = match.timestamp
        ? new Date(match.timestamp).toLocaleTimeString()
        : ""
      const role =
        match.type === "user"
          ? "👤 User"
          : match.type === "assistant"
            ? "🤖 Assistant"
            : match.type

      console.log(`\n${role} (${time}):`)
      console.log("─".repeat(60))

      // Highlight the match in the context
      const highlighted = highlightMatch(match.context, regex)
      console.log(highlighted)
    }

    if (sessionMatches.length > 5) {
      console.log(
        `\n  ... and ${sessionMatches.length - 5} more matches in this session`,
      )
    }
    console.log()
  }

  if (matches.length >= limit) {
    console.log(`\n(showing first ${limit} matches, use --limit N for more)`)
  }
}

function extractTextContent(record: Record<string, unknown>): string | null {
  const parts: string[] = []

  // Handle user messages
  if (record.type === "user" && record.message) {
    const message = record.message as { content?: unknown }
    if (typeof message.content === "string") {
      parts.push(message.content)
    } else if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (typeof item === "string") {
          parts.push(item)
        } else if (item && typeof item === "object" && "text" in item) {
          parts.push(String((item as { text: unknown }).text))
        }
      }
    }
  }

  // Handle assistant messages
  if (record.type === "assistant" && record.message) {
    const message = record.message as { content?: unknown }
    if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>
          // Text blocks
          if (obj.type === "text" && typeof obj.text === "string") {
            parts.push(obj.text)
          }
          // Tool use - include the input as searchable text
          if (obj.type === "tool_use" && obj.input) {
            parts.push(JSON.stringify(obj.input))
          }
          // Thinking blocks
          if (obj.type === "thinking" && typeof obj.thinking === "string") {
            parts.push(obj.thinking)
          }
        }
      }
    }
  }

  // Handle tool results
  if (record.type === "tool_result" && record.content) {
    if (typeof record.content === "string") {
      parts.push(record.content)
    } else if (Array.isArray(record.content)) {
      for (const item of record.content) {
        if (typeof item === "string") {
          parts.push(item)
        } else if (item && typeof item === "object" && "text" in item) {
          parts.push(String((item as { text: unknown }).text))
        }
      }
    }
  }

  return parts.length > 0 ? parts.join("\n") : null
}

function highlightMatch(text: string, regex: RegExp): string {
  // Use ANSI codes for highlighting
  const YELLOW = "\x1b[33m"
  const BOLD = "\x1b[1m"
  const RESET = "\x1b[0m"

  return text.replace(
    new RegExp(`(${regex.source})`, "gi"),
    `${BOLD}${YELLOW}$1${RESET}`,
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function printHelp(): void {
  console.log(`
Claude Session - Utilities for working with Claude Code session files

Usage: bun ./scripts/claude-session.ts <command> [options]

Commands:
  list [project]       List all sessions, optionally filter by project
  show <session-id>    Show session details and file writes
  index                Build/rebuild file write index
  search <pattern>     Search indexed writes by file path pattern
  grep <pattern>       Search ALL session content (conversations, code, etc.)
  writes [--date D]    List recent writes, optionally filter by date
  restore <file>       Restore file content from session history
  stats                Show index statistics

Grep options:
  --project <name>     Filter by project name
  --limit <n>          Max matches to return (default: 50)
  --context <n>        Lines of context around match (default: 2)

Examples:
  bun ./scripts/claude-session.ts list
  bun ./scripts/claude-session.ts list km
  bun ./scripts/claude-session.ts show 03e4eae4
  bun ./scripts/claude-session.ts index
  bun ./scripts/claude-session.ts search '**/chaos*.ts'
  bun ./scripts/claude-session.ts grep "loading progress"
  bun ./scripts/claude-session.ts grep "progressx" --project km --limit 20
  bun ./scripts/claude-session.ts writes --date 2026-01-22
  bun ./scripts/claude-session.ts restore packages/km-storage/scripts/chaos-cli.ts
  bun ./scripts/claude-session.ts stats
`)
}

// Main entry point
if (import.meta.main) {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case "list":
      await cmdList(args[1])
      break

    case "show":
      if (!args[1]) {
        console.error("Usage: claude-session show <session-id>")
        process.exit(1)
      }
      await cmdShow(args[1])
      break

    case "index":
    case "rebuild": // alias for backwards compat
      await cmdIndex()
      break

    case "search":
      if (!args[1]) {
        console.error("Usage: claude-session search <pattern>")
        process.exit(1)
      }
      await cmdSearch(args[1])
      break

    case "grep": {
      if (!args[1]) {
        console.error(
          "Usage: claude-session grep <pattern> [--project name] [--limit n] [--context n]",
        )
        process.exit(1)
      }
      const grepOptions: {
        project?: string
        limit?: number
        context?: number
      } = {}
      const projectIdx = args.indexOf("--project")
      if (projectIdx !== -1 && args[projectIdx + 1]) {
        grepOptions.project = args[projectIdx + 1]
      }
      const limitIdx = args.indexOf("--limit")
      if (limitIdx !== -1 && args[limitIdx + 1]) {
        grepOptions.limit = parseInt(args[limitIdx + 1]!, 10)
      }
      const contextIdx = args.indexOf("--context")
      if (contextIdx !== -1 && args[contextIdx + 1]) {
        grepOptions.context = parseInt(args[contextIdx + 1]!, 10)
      }
      await cmdGrep(args[1], grepOptions)
      break
    }

    case "writes": {
      let dateFilter: string | undefined
      const dateIdx = args.indexOf("--date")
      if (dateIdx !== -1 && args[dateIdx + 1]) {
        dateFilter = args[dateIdx + 1]
      }
      await cmdWrites(dateFilter)
      break
    }

    case "restore": {
      if (!args[1]) {
        console.error(
          "Usage: claude-session restore <file-path> [--session <id>]",
        )
        process.exit(1)
      }
      let sessionId: string | undefined
      const sessionIdx = args.indexOf("--session")
      if (sessionIdx !== -1 && args[sessionIdx + 1]) {
        sessionId = args[sessionIdx + 1]
      }
      await cmdRestore(args[1], sessionId)
      break
    }

    case "stats":
      await cmdStats()
      break

    case "help":
    case "--help":
    case "-h":
      printHelp()
      break

    default:
      if (command) {
        console.error(`Unknown command: ${command}`)
      }
      printHelp()
      process.exit(command ? 1 : 0)
  }
}

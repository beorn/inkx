import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { claudeProjectsRoot } from "@km/config/paths"
import type { SubagentSessionSummary } from "./session-metadata.ts"

type TranscriptSummary = {
  readonly startedAt?: number
  readonly completedAt?: number
  readonly status: SubagentSessionSummary["status"]
  readonly prompt?: string
  readonly resultText?: string
}

export function claudeSubagentsDir(cwd: string, sessionId: string): string {
  return join(claudeProjectsRoot(), claudeProjectDir(cwd), sessionId, "subagents")
}

export function discoverClaudeSubagentSessions(cwd: string, sessionId: string): readonly SubagentSessionSummary[] {
  return readClaudeSubagentSessionsFromDir(claudeSubagentsDir(cwd, sessionId))
}

export function readClaudeSubagentSessionsFromDir(subagentsDir: string): readonly SubagentSessionSummary[] {
  if (!existsSync(subagentsDir)) return []
  let names: string[]
  try {
    names = readdirSync(subagentsDir)
  } catch {
    return []
  }

  const summaries: SubagentSessionSummary[] = []
  const seen = new Set<string>()
  for (const name of names.sort()) {
    const match = name.match(/^agent-(.+)\.meta\.json$/u)
    if (!match?.[1]) continue
    const id = match[1]
    if (seen.has(id)) continue
    seen.add(id)
    const metadataPath = join(subagentsDir, name)
    const transcriptPath = join(subagentsDir, `agent-${id}.jsonl`)
    const meta = readJsonObject(metadataPath)
    const transcript = readTranscriptSummary(transcriptPath)
    summaries.push({
      id,
      provider: "claude",
      agentType: stringField(meta.agentType) ?? stringField(meta.agent) ?? stringField(meta.subagent_type),
      description: stringField(meta.description),
      prompt: transcript.prompt,
      resultText: transcript.resultText,
      status: transcript.status,
      startedAt: transcript.startedAt,
      completedAt: transcript.completedAt,
      transcriptPath,
      metadataPath,
    })
  }

  return summaries.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.id.localeCompare(b.id))
}

function readTranscriptSummary(path: string): TranscriptSummary {
  if (!existsSync(path)) return { status: "running" }
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return { status: "running" }
  }

  let startedAt: number | undefined
  let completedAt: number | undefined
  let prompt: string | undefined
  let resultText: string | undefined
  let status: SubagentSessionSummary["status"] = "running"
  let sawToolResult = false

  for (const line of raw.split("\n")) {
    if (line.length === 0) continue
    const row = parseJsonObject(line)
    if (!row) continue
    const ts = parseTimestamp(row.timestamp)
    if (ts !== undefined && startedAt === undefined) startedAt = ts
    const message = objectField(row.message)
    const role = stringField(message.role)
    if (role === "user") {
      if (prompt === undefined) prompt = contentText(message.content)
      if (hasToolResultContent(message.content)) sawToolResult = true
    }
    if (role === "assistant") {
      const text = contentText(message.content)
      const stopReason = stringField(message.stop_reason)
      if (text) {
        resultText = text
        if (sawToolResult) {
          status = "done"
          completedAt = ts ?? completedAt
        }
      }
      if (stopReason === "end_turn") {
        status = "done"
        completedAt = ts ?? completedAt
      }
    }
  }

  return { startedAt, completedAt, prompt, resultText, status }
}

function readJsonObject(path: string): Record<string, unknown> {
  try {
    return parseJsonObject(readFileSync(path, "utf8")) ?? {}
  } catch {
    return {}
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    return objectField(parsed)
  } catch {
    return null
  }
}

function contentText(content: unknown): string | undefined {
  if (typeof content === "string") return content.trim() || undefined
  if (!Array.isArray(content)) return undefined
  const text = content
    .map((part) => {
      const obj = objectField(part)
      if (obj.type === "text") return stringField(obj.text) ?? ""
      if (obj.type === "tool_result") return stringField(obj.content) ?? ""
      return ""
    })
    .filter(Boolean)
    .join("\n")
    .trim()
  return text || undefined
}

function hasToolResultContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  return content.some((part) => objectField(part).type === "tool_result")
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function objectField(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function claudeProjectDir(cwd: string): string {
  return cwd.replace(/\//g, "-")
}

/**
 * Session Queries
 *
 * Query functions for agent sessions.
 * Sessions are stored as changes in changes.jsonl.
 */

import type { SessionStartedData, SessionEndedData } from "@km/core"
import { readChanges } from "@km/storage"
import type { Session, SessionFilter, SessionStatus } from "./types.ts"

/**
 * Query sessions, optionally filtered.
 *
 * Reads session_started and session_ended changes from changes.jsonl,
 * reconstructs Session objects, and applies filters.
 *
 * @param kmDir - Path to .km directory containing changes.jsonl
 * @param filter - Optional filter criteria
 */
export function querySessions(kmDir: string, filter?: SessionFilter): Session[] {
  const events = readChanges(kmDir)

  // Build sessions from events
  const sessionMap = new Map<string, Session>()

  for (const event of events) {
    if (event.type === "session_started") {
      const data = event.data as unknown as SessionStartedData
      sessionMap.set(data.session_id, {
        id: data.session_id,
        agentId: event.actor,
        taskId: event.target ?? undefined,
        model: data.model,
        status: "active" as SessionStatus,
        startedAt: event.ts,
      })
    } else if (event.type === "session_ended") {
      const data = event.data as unknown as SessionEndedData
      const session = sessionMap.get(data.session_id)
      if (session) {
        session.status = mapSessionStatus(data.status)
        session.endedAt = event.ts
        session.totalTokens = data.total_tokens
        session.costUsd = data.cost_usd
        session.summary = data.summary
      }
    }
  }

  let sessions = Array.from(sessionMap.values())

  // Apply filters
  if (filter?.agentId) {
    sessions = sessions.filter((s) => s.agentId === filter.agentId)
  }
  if (filter?.taskId) {
    sessions = sessions.filter((s) => s.taskId === filter.taskId)
  }
  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
    sessions = sessions.filter((s) => statuses.includes(s.status))
  }

  return sessions
}

/**
 * Map event status to session status.
 */
function mapSessionStatus(eventStatus: "success" | "error" | "cancelled"): SessionStatus {
  switch (eventStatus) {
    case "success":
      return "completed"
    case "error":
      return "error"
    case "cancelled":
      return "cancelled"
  }
}

/**
 * Get a single session by ID.
 */
export function getSession(kmDir: string, sessionId: string): Session | null {
  const sessions = querySessions(kmDir)
  return sessions.find((s) => s.id === sessionId) ?? null
}

/**
 * Get all sessions for an agent.
 */
export function getAgentSessions(kmDir: string, agentId: string, limit?: number): Session[] {
  let sessions = querySessions(kmDir, { agentId })

  // Sort by startedAt descending (most recent first)
  sessions.sort((a, b) => b.startedAt - a.startedAt)

  if (limit !== undefined) {
    sessions = sessions.slice(0, limit)
  }

  return sessions
}

/**
 * Get all sessions for an issue/task.
 */
export function getTaskSessions(kmDir: string, taskId: string): Session[] {
  return querySessions(kmDir, { taskId })
}

/**
 * Get the currently active session for an agent, if any.
 */
export function getActiveSession(kmDir: string, agentId: string): Session | null {
  const sessions = querySessions(kmDir, { agentId, status: "active" })
  return sessions[0] ?? null
}

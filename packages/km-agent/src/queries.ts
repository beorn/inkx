/**
 * Agent Queries
 *
 * Query functions for agents and their work queues.
 */

import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"
import type { Agent, AgentFilter } from "./types.ts"

/**
 * Query all agents, optionally filtered.
 */
export function queryAgents(repo: Repo, filter?: AgentFilter): Agent[] {
  // Agents are oi nodes with data.kind === "agent"
  const nodes = repo.query("type:oi").filter((n) => n.data?.kind === "agent")
  let agents = nodes.map(nodeToAgent)

  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
    agents = agents.filter((a) => statuses.includes(a.status))
  }
  if (filter?.harness) {
    agents = agents.filter((a) => a.harness === filter.harness)
  }
  if (filter?.model) {
    agents = agents.filter((a) => a.model === filter.model)
  }

  return agents
}

/**
 * Get a single agent by short ID or full ID.
 */
export function getAgent(repo: Repo, idOrShortId: string): Agent | null {
  const agents = queryAgents(repo)

  // Try exact short ID match
  const byShortId = agents.find((a) => a.shortId === idOrShortId)
  if (byShortId) return byShortId

  // Try full ID match
  const byId = agents.find((a) => a.id === idOrShortId)
  if (byId) return byId

  // Try partial short ID match (agent-xxx)
  const normalized = idOrShortId.replace(/^agent-/, "")
  const byPartial = agents.find((a) => a.shortId === `agent-${normalized}` || a.id.endsWith(normalized))
  return byPartial ?? null
}

/**
 * Get agents that are currently running.
 */
export function getActiveAgents(repo: Repo): Agent[] {
  return queryAgents(repo, { status: "running" })
}

/**
 * Convert a KNode to an Agent.
 */
export function nodeToAgent(node: KNode): Agent {
  const data = node.data ?? {}

  const shortIdPart = typeof data.short_id === "string" ? data.short_id : node.id.slice(-4).toLowerCase()

  return {
    id: node.id,
    shortId: `agent-${shortIdPart}`,
    name: node.name || node.content || "Unnamed Agent",
    model: typeof data.model === "string" ? data.model : "claude-sonnet-4",
    harness: typeof data.harness === "string" ? data.harness : "general",
    status: typeof data.status === "string" ? (data.status as Agent["status"]) : "idle",
    workdir: typeof data.workdir === "string" ? data.workdir : undefined,
    pid: typeof data.pid === "number" ? data.pid : undefined,
    currentTaskId: typeof data.current_task_id === "string" ? data.current_task_id : undefined,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
  }
}

/**
 * Get issues in an agent's work queue (assigned to this agent).
 *
 * Note: This returns Issue objects from @km/beads.
 * Agents claim issues by having issues assigned to them via the assignee field.
 */
export function getAgentQueue(repo: Repo, agentId: string): AgentQueueItem[] {
  // Find the agent to get its shortId
  const agent = getAgent(repo, agentId)
  if (!agent) {
    return []
  }

  // Query tasks assigned to this agent
  // Issues are assigned via the assignee field matching agent.shortId
  // Don't filter by type='task' - issues can be file nodes with task_status
  const nodes = repo.query(`@${agent.shortId}`)

  return nodes.map((node) => {
    const data = node.data ?? {}
    const shortId = typeof data.short_id === "string" ? data.short_id : `km-${node.id.slice(-4).toLowerCase()}`

    return {
      issueId: node.id,
      issueShortId: shortId,
      title: node.content || node.title || "",
      priority: extractPriority(data),
      assignedAt: node.updated_at, // Approximate - would need event tracking for exact time
    }
  })
}

/**
 * Item in an agent's work queue.
 */
export interface AgentQueueItem {
  issueId: string
  issueShortId: string
  title: string
  priority: number
  assignedAt: number
}

/**
 * Extract priority from node data tags.
 */
function extractPriority(data: Record<string, unknown>): number {
  const tags = data.tags as string[] | undefined
  if (tags) {
    for (const tag of tags) {
      const pMatch = tag.match(/^P([0-4])$/i)
      if (pMatch?.[1]) {
        return parseInt(pMatch[1], 10)
      }
    }
  }
  return 2 // Default P2
}

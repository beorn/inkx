/**
 * Agent Mutations
 *
 * Functions for creating and updating agents.
 * These return node updates but don't persist directly.
 */

import type { KNode } from "@km/core"
import { ulid } from "ulid"
import type { Agent, AgentStatus, CreateAgentOptions } from "./types.ts"

/**
 * Create a new agent node (in-memory).
 * Returns the node and its short ID.
 */
export function createAgentNode(name: string, options: CreateAgentOptions = {}): { node: KNode; shortId: string } {
  const id = ulid()
  const shortId = options.customId ?? id.slice(-4).toLowerCase()
  const now = Date.now()

  const node: KNode = {
    id,
    type: "h",
    item: {},
    name,
    content: name,
    parent_id: null,
    parent_idx: 0,
    version: id, // Use creation ULID as initial version
    created_at: now,
    updated_at: now,
    data: {
      kind: "agent",
      short_id: shortId,
      model: options.model ?? "claude-sonnet-4",
      harness: options.harness ?? "general",
      status: "idle" as AgentStatus,
      workdir: options.workdir,
    },
  }

  return { node, shortId: `agent-${shortId}` }
}

/**
 * Update agent fields.
 * Returns partial node data for the update.
 */
export function updateAgentFields(
  agent: Agent,
  changes: Partial<Pick<Agent, "name" | "model" | "harness" | "status" | "currentTaskId">>,
): Partial<KNode> {
  const updates: Partial<KNode> = {
    updated_at: Date.now(),
  }

  if (changes.name !== undefined) {
    updates.name = changes.name
    updates.content = changes.name
  }

  const dataUpdates: Record<string, unknown> = {}

  if (changes.model !== undefined) {
    dataUpdates.model = changes.model
  }
  if (changes.harness !== undefined) {
    dataUpdates.harness = changes.harness
  }
  if (changes.status !== undefined) {
    dataUpdates.status = changes.status
  }
  if (changes.currentTaskId !== undefined) {
    dataUpdates.current_task_id = changes.currentTaskId
  }

  if (Object.keys(dataUpdates).length > 0) {
    updates.data = dataUpdates
  }

  return updates
}

/**
 * Mark agent as running with optional PID.
 */
export function startAgentFields(pid?: number): Partial<KNode> {
  return {
    updated_at: Date.now(),
    data: {
      status: "running" as AgentStatus,
      pid,
    },
  }
}

/**
 * Mark agent as stopped.
 */
export function stopAgentFields(): Partial<KNode> {
  return {
    updated_at: Date.now(),
    data: {
      status: "stopped" as AgentStatus,
      pid: undefined,
      current_task_id: undefined,
    },
  }
}

/**
 * Mark agent as idle (finished work but still available).
 */
export function idleAgentFields(): Partial<KNode> {
  return {
    updated_at: Date.now(),
    data: {
      status: "idle" as AgentStatus,
      current_task_id: undefined,
    },
  }
}

/**
 * Mark agent as having an error.
 */
export function errorAgentFields(error?: string): Partial<KNode> {
  return {
    updated_at: Date.now(),
    data: {
      status: "error" as AgentStatus,
      last_error: error,
    },
  }
}

/**
 * Assignment Operations
 *
 * These return field updates for issues (not agents) to track assignment.
 * The actual persistence is done by the caller using @km/storage.
 */

/**
 * Assign an issue to an agent.
 * Returns the fields to update on the issue node.
 */
export function assignIssueFields(agentShortId: string): IssueAssignment {
  return {
    assignee: agentShortId,
    updatedAt: Date.now(),
  }
}

/**
 * Unassign an issue from an agent.
 * Returns the fields to update on the issue node.
 */
export function unassignIssueFields(): IssueAssignment {
  return {
    assignee: undefined,
    updatedAt: Date.now(),
  }
}

/**
 * Claim an issue for an agent (assign + set agent's currentTaskId).
 * Returns updates for both the agent node and issue node.
 */
export function claimIssueFields(
  agentShortId: string,
  issueShortId: string,
): { agentUpdate: Partial<KNode>; issueAssignment: IssueAssignment } {
  return {
    agentUpdate: {
      updated_at: Date.now(),
      data: {
        current_task_id: issueShortId,
      },
    },
    issueAssignment: {
      assignee: agentShortId,
      updatedAt: Date.now(),
    },
  }
}

/**
 * Issue assignment result.
 */
export interface IssueAssignment {
  assignee?: string
  updatedAt: number
}

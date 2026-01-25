/**
 * Agent Types
 *
 * Core type definitions for AI agents in km.
 */

export interface Agent {
  id: string // Full node ID (ULID)
  shortId: string // Short ID (agent-xxxx or custom)
  name: string // Display name
  model: string // LLM model (claude-sonnet-4, etc.)
  harness: string // Harness name
  status: AgentStatus
  workdir?: string // Working directory
  pid?: number // Process ID when running
  currentTaskId?: string // Currently claimed issue
  createdAt: number
  updatedAt: number
}

export type AgentStatus = "idle" | "running" | "paused" | "stopped" | "error"

export interface AgentFilter {
  status?: AgentStatus | AgentStatus[]
  harness?: string
  model?: string
}

export interface CreateAgentOptions {
  model?: string // Default: claude-sonnet-4
  harness?: string // Default: general
  customId?: string // Custom short ID
  workdir?: string
}

export interface Harness {
  name: string
  description?: string
  tools: string[]
  connectors?: ConnectorConfig[]
  constraints?: HarnessConstraints
}

export interface ConnectorConfig {
  type: string // github, linear, slack, etc.
  permissions: string[]
}

export interface HarnessConstraints {
  read_only?: boolean
  max_files_per_session?: number
  max_tokens_per_session?: number
  allowed_paths?: string[]
  blocked_paths?: string[]
}

export interface Session {
  id: string // Session ULID
  agentId: string
  taskId?: string // Issue being worked on
  model: string
  status: SessionStatus
  startedAt: number
  endedAt?: number
  totalTokens?: number
  costUsd?: number
  summary?: string
}

export type SessionStatus = "active" | "completed" | "error" | "cancelled"

export interface SessionFilter {
  agentId?: string
  taskId?: string
  status?: SessionStatus | SessionStatus[]
}

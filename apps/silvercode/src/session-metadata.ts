export type SubagentSessionSummary = {
  id: string
  provider: "claude"
  agentType?: string
  description?: string
  prompt?: string
  resultText?: string
  status: "running" | "done" | "failed" | "cancelled"
  startedAt?: number
  completedAt?: number
  transcriptPath: string
  metadataPath?: string
}

export type SessionHistoryMetadata = {
  agent?: string
  sessionId?: string
  cwd: string
  model?: string
  account?: string
  resumeId?: string
  transcriptPath?: string
  spawnedAt: number
  replayStartedAt?: number
  replayCompletedAt?: number
  replayMessageCount?: number
  replayBoundaryMessageId?: string
  sessionInitAt?: number
  liveStartedAt?: number
  endedAt?: number
  subagentSessions?: readonly SubagentSessionSummary[]
}

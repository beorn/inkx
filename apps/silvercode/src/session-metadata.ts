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
  endedAt?: number
}

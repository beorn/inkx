import React from "react"
import { createRenderer, type App as RendererApp } from "@silvery/test"
import { Box } from "silvery"
import { createSessionStore, type MessageEntry, type SessionStore } from "@km/agent-harness"
import { findCodexTranscript, replayCodexSessionFromDisk } from "../codex-resume.ts"
import { replaySessionFromDisk, sessionJsonlPath } from "../resume.ts"
import { Content } from "../components/Content.tsx"
import { SessionUpdateList } from "../components/SessionUpdateList.tsx"
import type { SessionHistoryMetadata } from "../session-metadata.ts"

export type RenderResumedSessionOptions = {
  resume: string
  cwd?: string
  agent?: string
  cols?: number
  rows?: number
  follow?: "end" | false
  singlePassLayout?: boolean
  incremental?: boolean
  includeMetadata?: boolean
}

export type RenderedResumedSession = {
  readonly text: string
  readonly lines: readonly string[]
  readonly cols: number
  readonly rows: number
  readonly app: RendererApp
  readonly store: SessionStore
  readonly messages: readonly MessageEntry[]
  readonly metadata: SessionHistoryMetadata
  dispose(): void
}

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 40
const DEFAULT_CWD = "/Users/beorn/Code/pim/km"

export function renderResumedSession(opts: RenderResumedSessionOptions): RenderedResumedSession {
  const cols = opts.cols ?? DEFAULT_COLS
  const rows = opts.rows ?? DEFAULT_ROWS
  const cwd = opts.cwd ?? DEFAULT_CWD
  const parsed = parseResumeSpec(opts.resume, opts.agent)
  const store = createSessionStore()
  const metadata = replayIntoStore(store, parsed.agent, parsed.sessionId, cwd, opts.includeMetadata !== false)
  const state = store.state.get()
  const renderer = createRenderer({
    cols,
    rows,
    singlePassLayout: opts.singlePassLayout,
    incremental: opts.incremental ?? false,
  })
  const app = renderer(
    <Box width={cols} height={rows} flexDirection="column">
      <Content.Layout>
        <SessionUpdateList
          messages={state.messages}
          status={state.status}
          turnStartedAt={null}
          inputTokens={state.cost.inputTokens}
          outputTokens={state.cost.outputTokens}
          pendingPermissions={state.permissions.length}
          inFlightTool={null}
          sessionId={state.sessionId ?? parsed.sessionId}
          onApprove={() => {}}
          onDeny={() => {}}
          follow={opts.follow ?? false}
          sessionMetadata={opts.includeMetadata === false ? undefined : metadata}
          agentLabel={parsed.agent}
          agentVersion={state.claudeCodeVersion || null}
        />
      </Content.Layout>
    </Box>,
  )
  return {
    get text() {
      return app.text
    },
    get lines() {
      return app.lines
    },
    cols,
    rows,
    app,
    store,
    get messages() {
      return store.state.get().messages
    },
    metadata,
    dispose() {
      app.unmount()
    },
  }
}

function parseResumeSpec(resume: string, agent: string | undefined): { agent: string; sessionId: string } {
  const idx = resume.indexOf(":")
  if (idx > 0) return { agent: resume.slice(0, idx), sessionId: resume.slice(idx + 1) }
  return { agent: agent ?? "claude-code", sessionId: resume }
}

function replayIntoStore(
  store: SessionStore,
  agent: string,
  sessionId: string,
  cwd: string,
  includeMetadata: boolean,
): SessionHistoryMetadata {
  const spawnedAt = Date.now()
  const metadata: SessionHistoryMetadata = {
    agent,
    cwd,
    resumeId: `${agent}:${sessionId}`,
    spawnedAt,
    replayStartedAt: spawnedAt,
  }
  if (agent === "codex" || agent === "codex-spawn") {
    metadata.transcriptPath = findCodexTranscript(sessionId) ?? undefined
    replayCodexSessionFromDisk(store, sessionId)
  } else {
    metadata.transcriptPath = sessionJsonlPath(cwd, sessionId)
    replaySessionFromDisk(store, cwd, sessionId)
  }
  const completedAt = Date.now()
  metadata.replayCompletedAt = completedAt
  const state = store.state.get()
  metadata.sessionId = state.sessionId ?? sessionId
  metadata.model = state.model || undefined
  metadata.replayMessageCount = state.messages.length
  metadata.replayBoundaryMessageId = state.messages.at(-1)?.id
  return includeMetadata ? metadata : { ...metadata, replayStartedAt: undefined, replayCompletedAt: undefined }
}

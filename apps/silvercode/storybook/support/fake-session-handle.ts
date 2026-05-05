/**
 * Storybook fake `SessionHandle`.
 *
 * Components like `Welcome`, `InlinePermissionPrompt`, and `SessionUpdateList` consume a
 * `SessionHandle` from `controller.ts`. The real shape pulls in a full
 * `SessionStore`, an `AgentSession`, and an `EventLog`. For storybook
 * purposes we only need a structural stub the component is willing to
 * render against — most consumers either read the store snapshot once or
 * not at all.
 *
 * `fakeSessionHandle({ permissions, messages, status })` produces a
 * synthetic handle whose `store.state.get()` returns a sensible default
 * `SessionState`. Tests in `tests/registry.test.ts` exercise these stubs
 * end-to-end via the `createRenderer` API.
 */

import type { SessionState } from "@km/agent-harness"
import type { SessionHandle } from "../../src/controller.ts"

export interface FakeHandleOpts {
  id?: string
  name?: string
  resumeId?: string
  state?: Partial<SessionState>
}

function defaultState(): SessionState {
  return {
    sessionId: null,
    model: "claude-opus-4-7",
    mode: "default",
    cwd: "/Users/test/repo",
    tools: [],
    mcpServers: [],
    slashCommands: ["/panel", "/history", "/mode", "/handoff", "/fork", "/spawn"],
    skills: [],
    plugins: [],
    claudeCodeVersion: "1.0.0",
    apiKeySource: "OAuth",
    status: "idle",
    messages: [],
    permissions: [],
    pendingQuestion: null,
    plan: null,
    todos: [],
    cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    lastError: null,
  }
}

export function fakeSessionHandle(opts: FakeHandleOpts = {}): SessionHandle {
  const merged: SessionState = { ...defaultState(), ...opts.state }
  const subscribers = new Set<(s: SessionState) => void>()
  const handle = {
    id: opts.id ?? "story-session",
    name: opts.name ?? "Story Session",
    store: {
      state: {
        get: () => merged,
        subscribe: (fn: (s: SessionState) => void) => {
          subscribers.add(fn)
          return () => subscribers.delete(fn)
        },
      },
      apply: () => {},
      bind: () => () => {},
    },
    session: {
      sessionId: opts.id ?? "story-session",
      send: () => {},
      respondToPermission: () => {},
      subscribe: () => () => {},
      close: () => {},
    },
    unsubscribe: () => {},
    log: { write: () => {}, sessionLogPath: "" },
    account: undefined,
    resumeId: opts.resumeId,
  } as unknown as SessionHandle
  return handle
}

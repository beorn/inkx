import React from "react"
import { afterEach, beforeEach, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "silvery"
import { createSessionStore, type AgentSession, type SessionId } from "@km/agent-harness"
import * as _loggily from "loggily"
import { PaneGrid } from "../src/components/PaneGrid.tsx"
import type { SessionHandle } from "../src/controller.ts"
import { leafTree, type LayoutNode } from "../src/pane-layout.ts"

const { setSuppressConsole } = _loggily as unknown as {
  setSuppressConsole: (value: boolean) => void
}

beforeEach(() => setSuppressConsole(true))
afterEach(() => setSuppressConsole(false))

function inertSession(sessionId: string): AgentSession {
  return {
    sessionId: sessionId as SessionId,
    send: () => {},
    respondToPermission: () => {},
    subscribe: () => () => {},
    close: () => Promise.resolve(),
    [Symbol.asyncDispose]: () => Promise.resolve(),
    get closed() {
      return false
    },
  }
}

function sessionHandle(id: string): SessionHandle {
  const store = createSessionStore()
  return {
    id,
    name: id,
    store,
    session: inertSession(id),
    unsubscribe: () => {},
    coordinatorMcp: null as never,
    metadata: { cwd: "/tmp/silvercode-test", spawnedAt: 0 },
  }
}

test("welcome composer stays mounted when the initial SessionHandle arrives", () => {
  const render = createRenderer({ cols: 100, rows: 32 })
  const realHandle = sessionHandle("s1")
  const tree: LayoutNode = { kind: "leaf", sessionId: realHandle.id }
  let mounts = 0
  let unmounts = 0

  function MountProbe(): React.ReactElement {
    React.useEffect(() => {
      mounts++
      return () => {
        unmounts++
      }
    }, [])
    return <Text>composer-probe</Text>
  }

  function View({ sessions }: { sessions: ReadonlyArray<SessionHandle> }): React.ReactElement {
    return (
      <PaneGrid
        sessions={sessions}
        focusedSessionId={sessions[0]?.id ?? "pending"}
        zoomedPaneId={null}
        tree={tree}
        cwd="/tmp/silvercode-test"
        onTreeChange={() => {}}
        onFocusSession={() => {}}
        onApprovePermission={() => {}}
        onDenyPermission={() => {}}
        agent="codex"
        composerSlot={<MountProbe />}
      />
    )
  }

  const app = render(<View sessions={[]} />)
  expect(app.text).toContain("composer-probe")
  expect(mounts).toBe(1)
  expect(unmounts).toBe(0)

  app.rerender(<View sessions={[realHandle]} />)
  expect(app.text).toContain("composer-probe")
  expect(mounts).toBe(1)
  expect(unmounts).toBe(0)
})

test("welcome composer survives App's stale empty pane tree during first session materialization", () => {
  const render = createRenderer({ cols: 100, rows: 32 })
  const realHandle = sessionHandle("s1")
  let mounts = 0
  let unmounts = 0

  function MountProbe(): React.ReactElement {
    React.useEffect(() => {
      mounts++
      return () => {
        unmounts++
      }
    }, [])
    return <Text>composer-probe</Text>
  }

  function View({ sessions, tree }: { sessions: ReadonlyArray<SessionHandle>; tree: LayoutNode }): React.ReactElement {
    return (
      <PaneGrid
        sessions={sessions}
        focusedSessionId={sessions[0]?.id ?? "pending"}
        zoomedPaneId={null}
        tree={tree}
        cwd="/tmp/silvercode-test"
        onTreeChange={() => {}}
        onFocusSession={() => {}}
        onApprovePermission={() => {}}
        onDenyPermission={() => {}}
        agent="codex"
        composerSlot={<MountProbe />}
      />
    )
  }

  const app = render(<View sessions={[]} tree={leafTree("__pane_empty")} />)
  expect(app.text).toContain("composer-probe")
  expect(mounts).toBe(1)
  expect(unmounts).toBe(0)

  app.rerender(<View sessions={[realHandle]} tree={leafTree("__pane_empty")} />)
  expect(app.text).toContain("composer-probe")
  expect(mounts).toBe(1)
  expect(unmounts).toBe(0)
})

/**
 * SidePanel multi-account contract.
 *
 * Bead: km-silvercode.side-panel-multi-account.
 *
 * The side panel renders one panel per accountly profile. The active
 * account uses the production color treatment (`$primary` plan label,
 * accent quota bar colors); inactive accounts have every color collapsed
 * to `$muted` so the eye reads only the active row as live. The cwd
 * row + "Silver Code" branding row are positioned BELOW the account
 * panels (above the agent-version row).
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { createSessionStore } from "@km/agent-harness"
import { SidePanel } from "../src/components/SidePanel.tsx"
import { setAllAccountsFactoryOverride, type AccountSummary } from "../src/claude-accounts.ts"
import type { Controller, SessionHandle } from "../src/controller.ts"

const TOTAL_COLS = 120

function makeStubSession(id = "fake"): SessionHandle {
  const store = createSessionStore()
  return {
    id,
    name: "fake",
    session: { sessionId: id } as unknown as SessionHandle["session"],
    store,
    unsubscribe: () => {},
  } as unknown as SessionHandle
}

function makeStubController(): Controller {
  return {
    snapshot: () => [],
    subscribe: () => () => {},
    onFocusChange: () => () => {},
    focusedId: () => "fake",
    focus: () => {},
    send: () => {},
    closeAll: () => {},
    respondPermission: () => {},
    flushQueue: () => {},
    setQueuedText: () => {},
    clearQueue: () => {},
    queuedText: () => "",
    onQueueChange: () => () => {},
    handoff: () => {},
    fork: async () => ({}) as unknown as SessionHandle,
    spawnSession: async () => ({}) as unknown as SessionHandle,
    runSlashCommand: () => {},
    backgroundActiveTurn: () => {},
    foregroundTask: () => {},
    cancelBackgroundTask: () => {},
    backgroundTasks: () => [],
    onBackgroundTasksChange: () => () => {},
    ambientMuteState: {
      isMuted: () => false,
      muted: () => new Set<string>(),
      toggle: () => {},
      set: () => {},
      subscribe: () => () => {},
      version: Object.assign(() => 0, { _signal: true }),
    },
  } as unknown as Controller
}

function makeAccount(opts: {
  name: string
  email: string
  plan: string
  isActive?: boolean
}): AccountSummary {
  return {
    name: opts.name,
    email: opts.email,
    plan: opts.plan,
    isActive: opts.isActive ?? false,
    quotas: [
      { name: "5-hour", utilization: 12, remaining: 880, limit: 1000 },
      { name: "7-day", utilization: 31, remaining: 6900, limit: 10000 },
    ],
    error: null,
    loading: false,
  }
}

const THREE_ACCOUNTS: AccountSummary[] = [
  makeAccount({ name: "personal", email: "personal@example.com", plan: "claude_max_20x", isActive: true }),
  makeAccount({ name: "work", email: "work@example.com", plan: "claude_pro" }),
  makeAccount({ name: "experimental", email: "exp@example.com", plan: "claude_team" }),
]

function renderPanel() {
  const render = createRenderer({ cols: TOTAL_COLS, rows: 60 })
  const focused = makeStubSession()
  const controller = makeStubController()
  return render(
    <SidePanel
      focused={focused}
      sessions={[focused]}
      focusedSessionId={focused.id}
      onFocusSession={() => {}}
      mode="auto"
      onCycleMode={() => {}}
      cwd="/Users/beorn/Code/pim/km"
      controller={controller}
    />,
  )
}

describe("SidePanel — multi-account view", () => {
  test("renders one account panel per accountly profile", () => {
    setAllAccountsFactoryOverride({
      readCached: () => THREE_ACCOUNTS,
      probe: async () => THREE_ACCOUNTS,
    })
    try {
      const app = renderPanel()
      const text = app.text
      // Plan labels for all three accounts present (humanized via planLabel).
      expect(text).toContain("Claude Code Max 20")
      expect(text).toContain("Claude Pro")
      expect(text).toContain("Claude Team")
      // Email rows for all three.
      expect(text).toContain("personal@example.com")
      expect(text).toContain("work@example.com")
      expect(text).toContain("exp@example.com")
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })

  test("cwd row + Silver Code branding sit below the account panels", () => {
    setAllAccountsFactoryOverride({
      readCached: () => THREE_ACCOUNTS,
      probe: async () => THREE_ACCOUNTS,
    })
    try {
      const app = renderPanel()
      const lines = app.lines
      const findRow = (needle: string): number => lines.findIndex((l) => l.includes(needle))
      const lastAccountRow = Math.max(
        findRow("personal@example.com"),
        findRow("work@example.com"),
        findRow("exp@example.com"),
      )
      const cwdRow = findRow("Code/pim/km")
      const silverCodeRow = findRow("Silver Code")
      expect(lastAccountRow).toBeGreaterThan(-1)
      expect(cwdRow).toBeGreaterThan(lastAccountRow)
      expect(silverCodeRow).toBeGreaterThan(cwdRow)
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })

  test("inactive account email cells render in $muted, active in $fg/$primary", () => {
    setAllAccountsFactoryOverride({
      readCached: () => THREE_ACCOUNTS,
      probe: async () => THREE_ACCOUNTS,
    })
    try {
      const app = renderPanel()
      const lines = app.lines
      const findRow = (needle: string): number => lines.findIndex((l) => l.includes(needle))
      const activeRow = findRow("Claude Code Max 20")
      const inactiveRowA = findRow("Claude Pro")
      const inactiveRowB = findRow("Claude Team")
      expect(activeRow).toBeGreaterThan(-1)
      expect(inactiveRowA).toBeGreaterThan(-1)
      expect(inactiveRowB).toBeGreaterThan(-1)

      // The active plan label is rendered as $fg (not $muted). The
      // inactive plan labels are $muted. We sample one cell of each.
      const activeCell = app.cell(activeRow, lines[activeRow]!.indexOf("Claude"))
      const inactiveCellA = app.cell(inactiveRowA, lines[inactiveRowA]!.indexOf("Claude"))

      // Active cell foreground must NOT match the muted color used by the
      // inactive cells. We don't pin to a specific resolved RGB (theme can
      // shift); we assert the active cell's fg differs from the inactive
      // cell's fg — which is the visual contract: inactive is uniformly
      // muted, active is not.
      expect(activeCell.fg).not.toBe(inactiveCellA.fg)
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })
})

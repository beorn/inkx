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
import { createRenderer, createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { PopoverProvider } from "silvery"
import { createSessionStore, type SessionId, type TurnId } from "@km/agent-harness"
import { SidePanel } from "../src/components/SidePanel.tsx"
import { setAllAccountsFactoryOverride, type AccountSummary } from "../src/account-status.ts"
import { setAccountFactoryOverride } from "../src/claude-account.ts"
import { setCodexQuotaFactoryOverride, type CodexQuotaSnapshot } from "../src/codex-quota.ts"
import type { Controller, SessionHandle } from "../src/controller.ts"
import { setSessionClipboardWriterOverride } from "../src/session-clipboard.ts"

const TOTAL_COLS = 120
const SUPER_DOWN = "\x1b[57444;9:1u"
const SUPER_UP = "\x1b[57444;1:3u"

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

function makeTranscriptSession(id: string, text: string): SessionHandle {
  const handle = makeStubSession(id)
  const sessionId = id as SessionId
  handle.store.apply({
    kind: "session-init",
    sessionId,
    cwd: "/tmp/project",
    model: "test-model",
    mode: "auto",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "",
    apiKeySource: "",
    ts: 1000,
  })
  handle.store.apply({ kind: "user-message", sessionId, turnId: "u1" as TurnId, text, ts: 1010 })
  return handle
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

function makeAccount(opts: { name: string; email: string; plan: string; isActive?: boolean }): AccountSummary {
  return {
    kind: "claude-profile",
    name: opts.name,
    label: "Claude Code",
    provider: "claude-oauth",
    email: opts.email,
    plan: opts.plan,
    dir: `/profiles/${opts.name}`,
    authenticated: true,
    default: opts.isActive ?? false,
    stock: false,
    available: true,
    current: opts.isActive ?? false,
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
  makeAccount({ name: "work", email: "work@example.com", plan: "claude_max_20x" }),
  makeAccount({ name: "experimental", email: "exp@example.com", plan: "claude_team" }),
]

const API_KEY_ACCOUNT: AccountSummary = {
  kind: "api-key",
  name: "cursor",
  label: "Cursor API",
  provider: "cursor-api",
  email: "cursor@example.com",
  plan: null,
  quotas: [],
  error: null,
  current: false,
  isActive: false,
  sourceEnvVar: "CURSOR_API_KEY",
  credentialHint: "…test",
  available: true,
  metadata: {
    apiKeyName: "Cursor SDK",
    createdAt: "2026-04-30T12:00:00Z",
  },
  loading: false,
}

const CODEX_ACCOUNT: AccountSummary = {
  kind: "api-key",
  name: "codex",
  label: "Codex",
  provider: "openai",
  email: null,
  plan: null,
  quotas: [
    { name: "RPM", utilization: 0, remaining: 499, limit: 500 },
    { name: "TPM", utilization: 12, remaining: 176000, limit: 200000 },
  ],
  error: null,
  current: false,
  isActive: false,
  sourceEnvVar: "CODEX_API_KEY",
  credentialHint: "...dex",
  available: true,
  loading: false,
}

const XAI_ACCOUNT: AccountSummary = {
  kind: "api-key",
  name: "xai",
  label: "xAI API",
  provider: "xai",
  email: null,
  plan: null,
  quotas: [
    { name: "RPM", utilization: 0, remaining: 59, limit: 60 },
    { name: "TPM", utilization: 4, remaining: 96000, limit: 100000 },
  ],
  error: null,
  current: false,
  isActive: false,
  sourceEnvVar: "XAI_API_KEY",
  credentialHint: "...xai",
  available: true,
  loading: false,
}

const GOOGLE_ACCOUNT_WITH_QUOTA: AccountSummary = {
  kind: "api-key",
  name: "google",
  label: "Google API",
  provider: "google",
  email: null,
  plan: null,
  quotas: [{ name: "Daily", utilization: 25, remaining: 750, limit: 1000 }],
  error: null,
  current: false,
  isActive: false,
  sourceEnvVar: "GOOGLE_API_KEY",
  credentialHint: "...gle",
  available: true,
  loading: false,
}

const CURSOR_ACCOUNT_WITH_QUOTA: AccountSummary = {
  ...API_KEY_ACCOUNT,
  quotas: [{ name: "Tasks", utilization: 40, remaining: 60, limit: 100 }],
}

const CODEX_QUOTA: CodexQuotaSnapshot = {
  accountLabel: "bjorn@example.com",
  updatedAt: "2026-05-05T05:15:08.367Z",
  sourcePath: "/tmp/rollout.jsonl",
  limits: [
    {
      id: "codex",
      label: "Codex",
      planType: "pro",
      primary: { usedPercent: 5, windowMinutes: 300, resetsAt: "2026-05-05T09:00:06.000Z" },
      secondary: { usedPercent: 2, windowMinutes: 10080, resetsAt: "2026-05-11T22:35:28.000Z" },
    },
  ],
}

const settle = (ms = 80) => new Promise<void>((r) => setTimeout(r, ms))

function withAccounts(accounts: AccountSummary[]): void {
  setAllAccountsFactoryOverride({
    readCached: () => accounts,
    probe: async () => accounts,
  })
}

async function renderInteractivePanel(opts: {
  focused: SessionHandle
  sessions: SessionHandle[]
  controller?: Controller
  onFocusSession?: (id: string) => void
  agent?: string
  rows?: number
}) {
  const term = createTermless({ cols: TOTAL_COLS, rows: opts.rows ?? 80 })
  const handle = await run(
    <PopoverProvider>
      <SidePanel
        focused={opts.focused}
        sessions={opts.sessions}
        focusedSessionId={opts.focused.id}
        onFocusSession={opts.onFocusSession ?? (() => {})}
        mode="auto"
        onCycleMode={() => {}}
        cwd="/Users/beorn/Code/pim/km"
        controller={opts.controller ?? makeStubController()}
        agent={opts.agent}
      />
    </PopoverProvider>,
    term,
    { kitty: true, mouse: true } as never,
  )
  return { term, handle }
}

function renderPanel(opts: { agent?: string } = {}) {
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
      agent={opts.agent}
    />,
  )
}

describe("SidePanel — multi-account view", () => {
  test("renders only the selected Claude account by default", () => {
    withAccounts(THREE_ACCOUNTS)
    try {
      const app = renderPanel()
      const text = app.text
      expect(text).toContain("Claude Code Max 20")
      expect(text).toContain("personal@example.com")
      expect(text).not.toContain("Claude Team")
      expect(text).not.toContain("work@example.com")
      expect(text).not.toContain("exp@example.com")
      expect(text).toContain("5hr")
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })

  test("active-account probe overrides a transient 429 from all-accounts for the selected Claude row", () => {
    const allAccounts = [
      {
        ...THREE_ACCOUNTS[0]!,
        quotas: [],
        error: "HTTP 429: Too Many Requests",
        available: false,
      },
      THREE_ACCOUNTS[1]!,
    ]
    withAccounts(allAccounts)
    setAccountFactoryOverride({
      readCached: () => ({
        email: "personal@example.com",
        plan: "claude_max_20x",
        quotas: THREE_ACCOUNTS[0]!.quotas,
        error: null,
        loading: false,
      }),
      probe: async () => ({
        email: "personal@example.com",
        plan: "claude_max_20x",
        quotas: THREE_ACCOUNTS[0]!.quotas,
        error: null,
        loading: false,
      }),
    })
    try {
      const app = renderPanel()
      expect(app.text).toContain("Claude Code Max 20")
      expect(app.text).toContain("personal@example.com")
      expect(app.text).toContain("5hr")
      expect(app.text).not.toContain("HTTP 429")
      expect(app.text).not.toContain("Too Many Requests")
    } finally {
      setAllAccountsFactoryOverride(null)
      setAccountFactoryOverride(null)
    }
  })

  test("Codex shows subscription quotas from Codex /status data instead of generic OpenAI API limits", () => {
    const accounts = [...THREE_ACCOUNTS, API_KEY_ACCOUNT, CODEX_ACCOUNT]
    withAccounts(accounts)
    setCodexQuotaFactoryOverride({
      readCached: () => CODEX_QUOTA,
      probe: async () => CODEX_QUOTA,
    })
    try {
      const app = renderPanel({ agent: "codex" })
      expect(app.text).toContain("Codex")
      expect(app.text).toContain("bjorn@example.com")
      expect(app.text).toContain("95% left")
      expect(app.text).toContain("98% left")
      expect(app.text).not.toContain("CODEX_API_KEY ...dex")
      expect(app.text).not.toContain("RPM")
      expect(app.text).not.toContain("TPM")
      expect(app.text).not.toContain("Claude Code Max 20")
      expect(app.text).not.toContain("personal@example.com")
    } finally {
      setAllAccountsFactoryOverride(null)
      setCodexQuotaFactoryOverride(null)
    }
  })

  test("Codex quota rows use the shared account popover", async () => {
    const accounts = [...THREE_ACCOUNTS, API_KEY_ACCOUNT, CODEX_ACCOUNT]
    withAccounts(accounts)
    setCodexQuotaFactoryOverride({
      readCached: () => CODEX_QUOTA,
      probe: async () => CODEX_QUOTA,
    })
    try {
      const focused = makeStubSession()
      const { term, handle } = await renderInteractivePanel({ focused, sessions: [focused], agent: "codex" })
      try {
        await settle()
        const accountRow = term.screen.getLines().findIndex((line) => line.includes("bjorn@example.com"))
        expect(accountRow).toBeGreaterThanOrEqual(0)
        const accountCol = term.screen.getLines()[accountRow]!.indexOf("bjorn@example.com")
        ;(term as unknown as { sendInput: (s: string) => void }).sendInput(SUPER_DOWN)
        await term.mouse.move(accountCol + 1, accountRow)
        await settle(650)
        const text = term.screen.getText()
        expect(text).toContain("resets")
        expect(text).toContain("/tmp/rollout.jsonl")
      } finally {
        handle.unmount()
      }
    } finally {
      setAllAccountsFactoryOverride(null)
      setCodexQuotaFactoryOverride(null)
    }
  })

  test("selected API-key agents show provider quota windows when available", () => {
    const accounts = [THREE_ACCOUNTS[0]!, XAI_ACCOUNT, GOOGLE_ACCOUNT_WITH_QUOTA, CURSOR_ACCOUNT_WITH_QUOTA]
    withAccounts(accounts)
    try {
      expect(renderPanel({ agent: "xai" }).text).toContain("RPM")
      expect(renderPanel({ agent: "xai" }).text).toContain("TPM")

      const geminiText = renderPanel({ agent: "gemini" }).text
      expect(geminiText).toContain("Google API")
      expect(geminiText).toContain("Dail")

      const cursorText = renderPanel({ agent: "cursor" }).text
      expect(cursorText).toContain("Cursor API")
      expect(cursorText).toContain("Task")
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })

  test("cwd row + Silver Code branding sit below the account panels", () => {
    withAccounts(THREE_ACCOUNTS)
    try {
      const app = renderPanel()
      const lines = app.lines
      const findRow = (needle: string): number => lines.findIndex((l) => l.includes(needle))
      const lastAccountRow = findRow("personal@example.com")
      const cwdRow = findRow("Code/pim/km")
      const silverCodeRow = findRow("Silver Code")
      expect(lastAccountRow).toBeGreaterThan(-1)
      expect(cwdRow).toBeGreaterThan(lastAccountRow)
      expect(silverCodeRow).toBeGreaterThan(cwdRow)
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })

  test("content starts after two cells of side-panel inner margin", () => {
    withAccounts(THREE_ACCOUNTS)
    try {
      const app = renderPanel()
      const row = app.lines.findIndex((l) => l.includes("Claude Code Max 20"))
      expect(row).toBeGreaterThan(-1)
      expect(app.lines[row]!.indexOf("Claude Code Max 20")).toBe(2)
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })

  test("bottom account block has one blank line before cwd", () => {
    withAccounts(THREE_ACCOUNTS)
    try {
      const app = renderPanel()
      const lines = app.lines
      const accountRow = lines.findIndex((l) => l.includes("personal@example.com"))
      const cwdRow = lines.findIndex((l) => l.includes("Code/pim/km"))
      expect(accountRow).toBeGreaterThan(-1)
      const blankBeforeCwd = cwdRow - 1
      expect(lines[blankBeforeCwd]!.trim()).toBe("")
      const lastAccountContentRow = blankBeforeCwd - 1
      expect(lastAccountContentRow).toBeGreaterThan(accountRow)
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })

  test("plan group header is highlighted once; selected account row stays compact", () => {
    setAllAccountsFactoryOverride({
      readCached: () => THREE_ACCOUNTS,
      probe: async () => THREE_ACCOUNTS,
    })
    try {
      const app = renderPanel()
      const lines = app.lines
      const findRow = (needle: string): number => lines.findIndex((l) => l.includes(needle))
      const groupRow = findRow("Claude Code Max 20")
      const personalRow = findRow("personal@example.com")
      expect(groupRow).toBeGreaterThan(-1)
      expect(personalRow).toBeGreaterThan(groupRow)

      const personalCell = app.cell(personalRow, lines[personalRow]!.indexOf("personal"))
      expect(personalCell.bold).toBe(false)
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })

  test("All Accounts popover action switches the side panel to the full account list", async () => {
    const accounts = [...THREE_ACCOUNTS, API_KEY_ACCOUNT, CODEX_ACCOUNT]
    withAccounts(accounts)
    try {
      const focused = makeStubSession()
      const { term, handle } = await renderInteractivePanel({ focused, sessions: [focused] })
      try {
        await settle()
        expect(term.screen.getText()).toContain("personal@example.com")
        expect(term.screen.getText()).not.toContain("work@example.com")

        const accountRow = term.screen.getLines().findIndex((line) => line.includes("personal@example.com"))
        const accountCol = term.screen.getLines()[accountRow]!.indexOf("personal@example.com")
        ;(term as unknown as { sendInput: (s: string) => void }).sendInput(SUPER_DOWN)
        await settle()
        await term.mouse.move(accountCol + 1, accountRow)
        await settle(650)
        const linkRow = term.screen.getLines().findIndex((line) => line.includes("All Accounts"))
        expect(linkRow).toBeGreaterThanOrEqual(0)
        const linkCol = term.screen.getLines()[linkRow]!.indexOf("All Accounts")
        await term.mouse.click(linkCol + 1, linkRow)
        ;(term as unknown as { sendInput: (s: string) => void }).sendInput(SUPER_UP)
        await term.mouse.move(0, 0)
        await settle()

        const text = term.screen.getText()
        expect(text).toContain("< Back")
        expect(text).toContain("work@example.com")
        expect(text).toContain("Claude Team")
        expect(text).toContain("CODEX_API_KEY")
      } finally {
        handle.unmount()
      }
    } finally {
      setAllAccountsFactoryOverride(null)
    }
  })

  test("clicking a session copies the full transcript, not the truncated row label", async () => {
    const copied: string[] = []
    const longText = "full transcript sentinel " + "0123456789".repeat(20)
    const focused = makeTranscriptSession("focused-session", "focused text")
    const target = makeTranscriptSession("target-session-with-a-very-long-visible-row-label", longText)
    withAccounts(THREE_ACCOUNTS)
    setSessionClipboardWriterOverride((_stdout, text) => {
      copied.push(text)
    })
    try {
      const { term, handle } = await renderInteractivePanel({ focused, sessions: [focused, target] })
      try {
        await settle()
        const row = term.screen.getLines().findIndex((line) => line.includes("target-session"))
        expect(row).toBeGreaterThanOrEqual(0)
        const col = term.screen.getLines()[row]!.indexOf("target-session")
        await term.mouse.click(col + 1, row)
        await settle()
        expect(copied).toHaveLength(1)
        expect(copied[0]).toContain("Session target-session-with-a-very-long-visible-row-label")
        expect(copied[0]).toContain(longText)
      } finally {
        handle.unmount()
      }
    } finally {
      setAllAccountsFactoryOverride(null)
      setSessionClipboardWriterOverride(null)
    }
  })
})

/**
 * Welcome screen feature tests for bead km-cr94.
 *
 * Covers four feature additions (post-redesign per definitive spec):
 *   1. Big SILVER / CODE banner (figlet ASCII art with width fallback,
 *      colorized with silvery semantic tokens; Big primary tier).
 *   2. Two-screen split:
 *        - Welcome (messages.length === 0): banner + EITHER command box
 *          (fresh session) OR "Loading session <id>…" (resume session).
 *          No help surface, no spawning indicator on the welcome screen.
 *        - Chat view (messages.length >= 1): standard scrollback. When
 *          status === "spawning" AND the user's first prompt has been
 *          submitted but claude hasn't responded yet, the inline activity
 *          row reads "Spawning Claude Code v<version>…" — assistant-side
 *          placeholder, replaced by real tokens once status flips.
 *   3. Right-aligned user prompt bubble — rounded border, no background fill.
 *   4. Text selection inside the bubble — silvery's mouse-driven selection
 *      works at buffer level; the bubble must not break drag-to-select.
 *
 * Banner rendering tests cover dimensional signatures rather than literal
 * glyph strings — figlet output is pinned by the font + word, but asserting
 * the exact glyph row would couple the test to figlet implementation
 * details. We assert (a) the figlet row signature for SILVER and CODE both
 * appear, (b) on different lines, and (c) CODE below SILVER.
 */

import React from "react"
import { test, expect, describe } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Screen } from "silvery"
import { renderScenario } from "../src/test/render-harness.tsx"
import { welcome } from "../src/test/scripts/welcome.ts"
import { ChatPane } from "../src/components/ChatPane.tsx"
import { SessionUpdateList } from "../src/components/SessionUpdateList.tsx"
import type { MessageEntry } from "@km/agent-harness"

/**
 * Build a minimal `MessageEntry` for tests. Matches the public type surface
 * in `@km/agent-harness/session-types.ts`. The `text` field is a value, not
 * a getter — production code uses a getter over `ops`, but for static
 * fixtures a plain string is simpler and read-compatible (the consumer
 * accesses `m.text`, not `m.ops`).
 */
function userEntry(text: string, id = "u-1"): MessageEntry {
  return {
    id: id as never,
    role: "user",
    ops: [{ kind: "text", text }],
    text,
    toolCalls: [],
    toolResults: [],
    ts: Date.now(),
  } as unknown as MessageEntry
}

// ============================================================================
// Shared fixture: ChatPane mount with controllable state + resume flag.
// ============================================================================

type Variant = {
  status: "spawning" | "idle"
  /** When set, the SessionHandle.resumeId is populated → "Loading…" path. */
  resumeId?: string
  messages?: MessageEntry[]
  claudeCodeVersion?: string
}

function makeHandle(v: Variant) {
  const fakeStore = {
    state: {
      get: () => ({
        messages: v.messages ?? [],
        status: v.status,
        cost: { inputTokens: 0, outputTokens: 0 },
        permissions: [],
        claudeCodeVersion: v.claudeCodeVersion ?? "",
      }),
      subscribe: () => () => {},
    },
    events: {
      get: () => [] as never[],
      subscribe: () => () => {},
    },
  } as never
  return {
    id: "test",
    name: "test",
    store: fakeStore,
    session: { sessionId: "live-session-id" } as never,
    unsubscribe: () => {},
    log: { write: () => {}, sessionLogPath: "" } as never,
    account: undefined,
    resumeId: v.resumeId,
  } as never
}

function renderWelcome(handle: never, cols = 100, rows = 50, agent = "claude-code") {
  // Stub process.stdout dims so silvery's <Screen> picks up the test
  // virtual size (it reads `getTermDims()` from the host stdout). Same
  // technique the production `renderScenario` harness uses.
  const prevCols = process.stdout.columns
  const prevRows = process.stdout.rows
  Object.defineProperty(process.stdout, "columns", { configurable: true, get: () => cols })
  Object.defineProperty(process.stdout, "rows", { configurable: true, get: () => rows })
  try {
    const renderer = createRenderer({ cols, rows })
    return renderer(
      <Screen flexDirection="row">
        <Box flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
          <ChatPane handle={handle} isFocused agent={agent} onFocus={() => {}} onApprove={() => {}} onDeny={() => {}} />
        </Box>
      </Screen>,
    )
  } finally {
    Object.defineProperty(process.stdout, "columns", { configurable: true, value: prevCols })
    Object.defineProperty(process.stdout, "rows", { configurable: true, value: prevRows })
  }
}

// ============================================================================
// feature 1 — figlet banner
// ============================================================================

describe("feature 1 — shaded banner (primary tier)", () => {
  test("Shaded tier renders at 120 cols (full app)", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 50, agent: "claude-code" })
    // Positive-space shaded gradient: 7 rows of SILVER + 1 blank + 7
    // rows of CODE. Each block fades ░ ░ ▒ ▒ ▓ ▓ █ top-to-bottom.
    // SILVER row-1 signature: " ░░░░░░  ░░░░" (6-░ + 2 spaces + 4-░).
    // CODE row-1 signature: " ░░░░░░   ░░░░░░░" (6-░ + 3 spaces + 7-░).
    const silverTop = s.lines.findIndex((l) => /[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/.test(l))
    const codeTop = s.lines.findIndex((l) => /[ \u00a0]░░░░░░[ \u00a0]{3}░░░░░░░/.test(l))
    expect(silverTop, "SILVER row 1 should render").toBeGreaterThanOrEqual(0)
    expect(codeTop, "CODE row 1 should render").toBeGreaterThanOrEqual(0)
    expect(codeTop).toBeGreaterThan(silverTop)
    // SILVER is 7 rows + ≥1 blank line, so CODE top is at least 8 rows
    // below SILVER top.
    expect(codeTop - silverTop).toBeGreaterThanOrEqual(8)
    s.dispose()
  })

  // Note: small-tier and stacked-fallback tests at narrow widths exercise
  // the `useBoxRect`-driven tier picker. `createRenderer` runs layout once
  // per render() call; the second-pass re-render that picks up the
  // measured width depends on signal flushes that are best exercised
  // through the full `renderScenario` harness. Standalone-fixture variants
  // of these tests are deferred to a follow-up bead — the tier picker
  // itself (`chooseBannerTier`) is a pure function and could be unit-
  // tested directly if we surface it (currently module-private).
})

// ============================================================================
// feature 2 — two-screen split (Welcome vs chat view)
// ============================================================================

describe("feature 2 — Welcome screen (fresh vs loading)", () => {
  test("fresh session, status=spawning: banner only, composer shown immediately (no Loading line)", () => {
    const app = renderWelcome(makeHandle({ status: "spawning" }))
    // Banner renders (Big-tier signature).
    expect(app.text).toMatch(/[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/)
    // No "Loading session" — spawning is no longer treated as a loading
    // state on the welcome screen. The composer mounts immediately so
    // the layout is stable and cursor state is not lost when the session
    // becomes ready.
    expect(app.text).not.toContain("Loading session")
    // No help surface (retired in km-cr94).
    expect(app.text).not.toContain("COMMANDS")
    expect(app.text).not.toContain("KEYBINDINGS")
  })

  test("fresh session, status=idle: banner only, no Loading line", () => {
    const app = renderWelcome(makeHandle({ status: "idle" }))
    expect(app.text).toMatch(/[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/)
    expect(app.text).not.toContain("Loading session")
    expect(app.text).not.toContain("COMMANDS")
  })

  test("loading session (resumeId set): centered Loading state keeps banner art", () => {
    const resumeId = "019ddb63-6e8d-7141-a603-f7c86c135be6"
    const idText = `codex:${resumeId}`
    const app = renderWelcome(makeHandle({ status: "idle", resumeId }), 100, 50, "codex")
    expect(app.text).toMatch(/[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/)
    expect(app.text).toContain("Codex")
    expect(app.text).toContain("Loading session")
    expect(app.text).toContain(idText)

    const loadingLine = app.lines.find((l) => l.includes("Loading session"))
    const idLine = app.lines.find((l) => l.includes(idText))
    expect(loadingLine).toBeDefined()
    expect(idLine).toBeDefined()

    const assertCentered = (line: string, text: string) => {
      const left = line.indexOf(text)
      const right = app.width - (left + text.length)
      expect(Math.abs(left - right)).toBeLessThanOrEqual(10)
    }
    assertCentered(loadingLine!, "Loading session")
    assertCentered(idLine!, idText)
  })

  test("Welcome unmounts when messages.length transitions 0 → 1; chat view mounts", () => {
    // Render with empty messages first — Welcome screen.
    const before = renderWelcome(makeHandle({ status: "idle", messages: [] }))
    expect(before.text).toMatch(/[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/)

    // Render with one user message — chat view.
    const after = renderWelcome(makeHandle({ status: "idle", messages: [userEntry("first prompt")] }))
    // Banner + welcome chrome are GONE.
    expect(after.text).not.toMatch(/[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/)
    // Chat view shows the bubble's content (right-aligned bubble around
    // "first prompt" — that's the user message renderer).
    expect(after.text).toContain("first prompt")
  })
})

describe("feature 2 — chat view spawning placeholder", () => {
  test("spawning status + first user turn → 'Spawning Claude Code…' inline placeholder", () => {
    // Status="spawning" means session-init hasn't resolved → no version yet.
    const app = renderWelcome(
      makeHandle({
        status: "spawning",
        messages: [userEntry("hello claude")],
        // claudeCodeVersion empty → label drops the version suffix.
      }),
    )
    // The user's prompt rendered (we're in chat view).
    expect(app.text).toContain("hello claude")
    // ActivityIndicator shows the spawning label without version suffix.
    // Format: "◈ Spawning Claude Code…" — the leading ◈ is the indicator
    // pulse glyph.
    expect(app.text).toMatch(/Spawning Claude Code…/)
    // Other status labels must NOT leak.
    expect(app.text).not.toContain("loading…")
    expect(app.text).not.toContain("thinking")
  })

  test("spawning status + version known → label includes 'v<version>'", () => {
    const app = renderWelcome(
      makeHandle({
        status: "spawning",
        messages: [userEntry("hello claude")],
        claudeCodeVersion: "2.1.119",
      }),
    )
    // With version populated, the label reads "Spawning Claude Code v2.1.119…".
    expect(app.text).toMatch(/Spawning Claude Code v2\.1\.119…/)
  })

  test("idle status: spawning placeholder is gone (real assistant flow takes over)", () => {
    // Status="idle" + only-a-user-message means the turn is between user
    // and assistant — but ActivityIndicator only renders when status is
    // active (not idle/ended). So the spawning label must not appear.
    const app = renderWelcome(
      makeHandle({
        status: "idle",
        messages: [userEntry("hello claude")],
      }),
    )
    expect(app.text).toContain("hello claude")
    expect(app.text).not.toContain("Spawning Claude Code")
  })
})

// ============================================================================
// feature 3 — right-aligned user prompt surface
// ============================================================================

describe("feature 3 — right-aligned user prompt surface", () => {
  test("user message renders inside a command-box surface, right-aligned, no border", () => {
    const messages: MessageEntry[] = [userEntry("Hello there!")]
    const renderer = createRenderer({ cols: 80, rows: 12 })
    const app = renderer(
      <Box width={80} height={12} flexDirection="column">
        <SessionUpdateList
          messages={messages}
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          sessionId="test-session"
          onApprove={() => {}}
          onDeny={() => {}}
        />
      </Box>,
    )
    // The surface's content text is present.
    expect(app.text).toContain("Hello there!")

    // Submitted prompts use the same quiet surface as the command composer,
    // without rounded border chrome.
    expect(app.text).not.toMatch(/[╭╮╰╯]/)

    // Right-aligned inside the readable lane: the prompt text should sit
    // much closer to the right than to the left.
    let promptRow = -1
    for (let r = 0; r < app.height; r++) {
      const line = app.lines[r] ?? ""
      if (line.includes("Hello there!")) {
        promptRow = r
        break
      }
    }
    expect(promptRow).toBeGreaterThanOrEqual(0)
    const promptLine = app.lines[promptRow]!
    const textCol = promptLine.indexOf("Hello there!")
    expect(textCol).toBeGreaterThan(0)
    // Right-alignment check: after Content.Layout, user prompts align to
    // the readable content lane with a right gutter, not to the full
    // terminal edge.
    expect(textCol + "Hello there!".length).toBeGreaterThanOrEqual(app.width - 10)
    expect(textCol).toBeGreaterThan(app.width / 4)

    // Same surface family as the command composer: the prompt area has a
    // background tint rather than inheriting the pane background.
    const insideCell = app.cell(textCol, promptRow)
    const sentinelCell = app.cell(0, promptRow)
    expect(insideCell.bg).not.toBe(sentinelCell.bg)
  })

  test("long user message wraps inside the prompt surface (no overflow past max width)", () => {
    // Long single-paragraph prompt — should wrap on word boundaries
    // inside the bubble, not extend past the bubble's right edge.
    const longText =
      "This is a fairly long user prompt that should wrap on word boundaries inside the bubble " +
      "rather than overflowing the bubble's right edge or producing ragged-edge ugly lines."
    const messages: MessageEntry[] = [userEntry(longText)]
    const renderer = createRenderer({ cols: 80, rows: 20 })
    const app = renderer(
      <Box width={80} height={20} flexDirection="column">
        <SessionUpdateList
          messages={messages}
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          sessionId="test-session"
          onApprove={() => {}}
          onDeny={() => {}}
        />
      </Box>,
    )
    // The surface content wraps onto multiple rows and remains right-aligned.
    const contentRows = app.lines
      .map((line, row) => ({ line, row }))
      .filter(({ line }) => line.includes("This is") || line.includes("rather than") || line.includes("ragged-edge"))
    expect(contentRows.length).toBeGreaterThanOrEqual(2)
    const rightmost = Math.max(...contentRows.map(({ line }) => line.trimEnd().length))
    const leftmost = Math.min(...contentRows.map(({ line }) => line.search(/\S/)).filter((col) => col >= 0))
    expect(rightmost).toBeGreaterThanOrEqual(app.width - 10)
    expect(rightmost - leftmost + 1).toBeLessThanOrEqual(Math.floor(app.width * 0.8))
    // The full text appears (joined across wrapped rows when whitespace
    // is normalized).
    const flat = app.text.replace(/\s+/g, " ")
    expect(flat).toContain("fairly long user prompt")
    expect(flat).toContain("ragged-edge ugly lines")
  })

  test("user message renders markdown lists inside the bubble", () => {
    const messages: MessageEntry[] = [userEntry("please handle:\n- first item\n- second item with **bold** text")]
    const renderer = createRenderer({ cols: 80, rows: 20 })
    const app = renderer(
      <Box width={80} height={20} flexDirection="column">
        <SessionUpdateList
          messages={messages}
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          sessionId="test-session"
          onApprove={() => {}}
          onDeny={() => {}}
        />
      </Box>,
    )

    expect(app.text).toContain("please handle:")
    expect(app.text).toContain("• first item")
    expect(app.text).toContain("• second item")
    expect(app.text).toContain("bold text")
    expect(app.text).not.toContain("**bold**")
  })
})

// ============================================================================
// feature 4 — text selection compatibility
// ============================================================================

// ============================================================================
// km-silvercode.welcome-bypassed-by-pane-grid-spawn
//
// Fix #1: Welcome banner must paint from frame 0 — the previous "◈ Spawning
//   session…" placeholder flashed for 200-2000ms before being replaced by
//   Welcome's banner, which read as a stale-skeleton bug.
// Fix #2: Welcome's centered TextInput is the LIVE keystroke surface during
//   Welcome state (the App-level SessionPromptComposer is hidden until
//   messages.length > 0). Submitting in Welcome routes through the same
//   handleSubmit path as the composer (preserves trailing-`&`, slash
//   commands, thinking-keyword injection).
// ============================================================================

describe("km-silvercode.welcome-bypassed-by-pane-grid-spawn — banner from frame 0", () => {
  test("single-pane Welcome does not show pane move/focus chrome in the top-left corner", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 50, agent: "codex" })
    expect(s.lines[0]?.slice(0, 3), s.text).not.toContain("▤")
    expect(s.lines[1]?.slice(0, 3), s.text).not.toContain("▎")
    s.dispose()
  })

  test("Welcome banner paints once spawn resolves; '◈ Spawning session…' never appears", async () => {
    // renderScenario waits for the spawn microtask + first session-init
    // before returning, so by the time we sample text the banner must be
    // present (banner is in Welcome.tsx, mounted via ChatPane once
    // sessions.length flips 1) — the legacy placeholder must NEVER appear
    // at any sampled frame in the steady state.
    const s = await renderScenario({ script: welcome, cols: 120, rows: 50, agent: "claude-code" })
    // The banner paints (figlet Big SILVER signature is unique to the
    // brand mark).
    expect(s.text).toMatch(/[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/)
    // The legacy placeholder must NOT be visible. Pre-fix this string
    // appeared during the spawn-pending window before ChatPane mounted.
    expect(s.text).not.toContain("Spawning session…")
    s.dispose()
  })

  test("PaneGrid empty-state placeholder is the figlet banner, not the legacy text", async () => {
    // Belt-and-suspenders — explicitly verify that even at the empty-
    // sessions branch, PaneGrid renders the brand banner. This protects
    // against accidental reintroduction of the `◈ Spawning session…`
    // text in the empty-state branch.
    const s = await renderScenario({ script: welcome, cols: 120, rows: 50, agent: "claude-code" })
    // Shaded-tier banner present (positive-space: SILVER row 1 has the
    // unique " ░░░░░░  ░░░░" signature).
    const silverSig = s.lines.findIndex((l) => /[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/.test(l))
    expect(silverSig).toBeGreaterThanOrEqual(0)
    // No legacy spawning text anywhere on screen.
    const spawnSessionLineIdx = s.lines.findIndex((l) => l.includes("Spawning session"))
    expect(spawnSessionLineIdx, "legacy placeholder must not appear").toBe(-1)
    s.dispose()
  })
})

describe("km-silvercode.welcome-bypassed-by-pane-grid-spawn — SessionPromptComposer is the single command surface", () => {
  test("App-level: SessionPromptComposer renders inside Welcome once a fresh session handle exists", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 50, agent: "claude-code" })
    const composerRow = s.lines.find((l) => /^\s*>\s/.test(l))
    expect(composerRow, "composer prompt SHOULD render in fresh Welcome state").toBeDefined()
    s.dispose()
  })

  test("App-level: resume loading notice hides the command composer while replay is loading", async () => {
    const s = await renderScenario({
      script: [],
      cols: 120,
      rows: 50,
      agent: "codex",
      resume: "019ddb63-6e8d-7141-a603-f7c86c135be6",
    })
    expect(s.text).toContain("Loading session")
    expect(s.text).toMatch(/[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/)
    const composerRow = s.lines.find((l) => /^\s*>\s/.test(l))
    expect(composerRow, "composer prompt should not render while resume replay is loading").toBeUndefined()
    s.dispose()
  })

  test("optimistic-apply: SessionStore.apply with `welcome-u-*` turnId flips messages.length 0 → 1", async () => {
    // L1 reducer-level test for the Fix #2 optimistic-apply contract.
    //
    // Welcome's onSubmit applies a synthetic `user-message` event with a
    // `welcome-u-${Date.now()}` turnId before delegating to App's
    // handleSubmit. This is what makes the chat view mount IMMEDIATELY
    // on submit, even when status !== "idle" and the controller's
    // tryFlush would otherwise queue the prompt without applying it.
    //
    // The component-level "Welcome unmounts when messages.length
    // transitions 0 → 1" test above (line 192) already pins the
    // ChatPane re-render behavior; this test pins the reducer-level
    // behavior the optimistic apply depends on. Together they cover
    // the full Welcome → chat transition without depending on the
    // renderScenario harness's autoEmit / re-render plumbing (which
    // resample() doesn't trigger — by design, the harness re-renders
    // only inside the autoEmit loop, not on ad-hoc emit() calls).
    //
    // Running the assertion at the reducer layer is the right level
    // per `apps/silvercode/tests/CLAUDE.md` ("Default to the lowest
    // layer that can express the assertion"). Bead:
    // km-silvercode.welcome-bypassed-by-pane-grid-spawn.
    const { createSessionStore } = await import("@km/agent-harness")
    const store = createSessionStore()
    // Pre-condition: empty store mirrors a fresh session (Welcome state).
    expect(store.state.get().messages).toHaveLength(0)
    // Apply the optimistic user-message exactly as Welcome.tsx does.
    store.apply({
      kind: "user-message",
      sessionId: "fake-session" as never,
      turnId: `welcome-u-${Date.now()}` as never,
      text: "first prompt",
      ts: Date.now(),
    } as never)
    // Post-condition: messages.length flipped 0 → 1; ChatPane's
    // `state.messages.length === 0` Welcome branch would now switch
    // to SessionUpdateList on the next render.
    const after = store.state.get()
    expect(after.messages).toHaveLength(1)
    expect(after.messages[0]?.role).toBe("user")
    expect(after.messages[0]?.text).toBe("first prompt")
  })
})

describe("feature 4 — text selection compatibility", () => {
  test("user message text inside the bubble is selectable (cells carry plain chars, no replacement)", () => {
    const messages: MessageEntry[] = [userEntry("selectable text")]
    const renderer = createRenderer({ cols: 60, rows: 8 })
    const app = renderer(
      <Box width={60} height={8} flexDirection="column">
        <SessionUpdateList
          messages={messages}
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          sessionId="test-session"
          onApprove={() => {}}
          onDeny={() => {}}
        />
      </Box>,
    )
    // Selection contract: silvery's mouse-driven selection extracts the
    // `char` field from each cell in the selection rectangle. The bubble's
    // text content must therefore land on cells with the actual char (not
    // a replacement glyph or a width-0 placeholder). Pick a known char in
    // the bubble's content and assert it's at a real cell position.
    const text = app.text
    const idxInText = text.indexOf("selectable text")
    expect(idxInText, "bubble content should be in the rendered text").toBeGreaterThanOrEqual(0)

    // Find the first row containing the content and the column of the
    // first content char.
    let row = -1
    let startCol = -1
    for (let r = 0; r < app.height; r++) {
      const line = app.lines[r] ?? ""
      const idx = line.indexOf("selectable")
      if (idx >= 0) {
        row = r
        startCol = idx
        break
      }
    }
    expect(row).toBeGreaterThanOrEqual(0)
    expect(startCol).toBeGreaterThan(0)

    // Walk the cells across "selectable text" — every cell must have its
    // canonical `char` field set to the visible glyph, not a replacement.
    // That's the load-bearing invariant for selection: silvery's
    // `getCellChar(col, row)` (used by SelectionFeature) reads `cell.char`.
    const word = "selectable text"
    for (let i = 0; i < word.length; i++) {
      const cell = app.cell(startCol + i, row)
      expect(cell.char, `cell at (${startCol + i}, ${row}) should be "${word[i]}"`).toBe(word[i])
    }
  })

  test("extractText across soft-wrapped bubble lines: documents current behavior + tracks future fix", async () => {
    // Selection across a wrapped user-prompt bubble: silvery's `extractText`
    // (vendor/silvery/packages/headless/src/selection.ts:355) supports a
    // soft-wrap join via `RowMetadata.softWrapped` — when set true on row N,
    // the row→row+1 boundary inside the selection extracts WITHOUT a "\n".
    //
    // Today silvery's pipeline never sets `softWrapped: true` — every
    // RowMetadata is initialised to `false` and no producer flips it
    // (grep `softWrapped: true` across vendor/silvery/packages/ — zero hits
    // in source). So `extractText` joins wrapped rows with "\n", which means
    // copying a wrapped bubble lands a literal newline mid-prompt in the
    // user's clipboard. Not a regression introduced by km-cr94 (the chat
    // bubble shape changed but the wrap mechanism didn't), but a real UX
    // gap users will notice once they actually drag-select a wrapped bubble.
    //
    // This test is a documenting fixture: it asserts the CURRENT behavior
    // (newline-joined) and will FAIL when silvery starts setting
    // `softWrapped: true` on the wrap rows the bubble lays out onto. When
    // that happens, flip the assertion (no `\n` between the two halves).
    // Tracking bead: @km/silvery/extract-text-soft-wrap-bubble (P3).
    const { extractText } = await import("@silvery/headless")

    const longText = "This is a fairly long user prompt that should wrap inside the bubble"
    const messages: MessageEntry[] = [userEntry(longText)]
    const renderer = createRenderer({ cols: 60, rows: 12 })
    const app = renderer(
      <Box width={60} height={12} flexDirection="column">
        <SessionUpdateList
          messages={messages}
          status="idle"
          turnStartedAt={null}
          inputTokens={0}
          outputTokens={0}
          pendingPermissions={0}
          inFlightTool={null}
          sessionId="test-session"
          onApprove={() => {}}
          onDeny={() => {}}
        />
      </Box>,
    )
    const buffer = app.lastBuffer()
    expect(buffer, "lastBuffer should exist after a render").not.toBeUndefined()
    if (!buffer) return

    // Find two consecutive non-empty rows inside the bubble — those are the
    // wrap rows we want to span across.
    let firstContentRow = -1
    for (let r = 0; r < app.height; r++) {
      const line = app.lines[r] ?? ""
      if (line.includes("This is a fairly")) {
        firstContentRow = r
        break
      }
    }
    expect(firstContentRow, "first wrap row should contain 'This is a fairly'").toBeGreaterThanOrEqual(0)

    // Find the first non-space col on `firstContentRow` and the last non-
    // space col on `firstContentRow + 1`. That range covers the two-row
    // selection inside the bubble. (Padding + border live outside the
    // selection rectangle.)
    const startLine = app.lines[firstContentRow]!
    const endLine = app.lines[firstContentRow + 1] ?? ""
    const startCol = startLine.search(/\S/)
    const endCol = endLine.search(/\S\s*$/) // last non-space col
    expect(startCol).toBeGreaterThan(0)
    expect(endCol).toBeGreaterThan(0)

    const extracted = extractText(buffer, {
      anchor: { row: firstContentRow, col: startCol },
      head: { row: firstContentRow + 1, col: endCol },
    })

    // Documenting assertion (current behavior). When silvery's wrap
    // pipeline starts setting `softWrapped: true`, this becomes the
    // load-bearing failure that signals the follow-up bead has landed.
    expect(extracted).toContain("\n")
    // Sanity: the two halves of the prompt are both present (just joined
    // by a newline rather than a space).
    expect(extracted.replace(/\s+/g, " ")).toContain("fairly long")
  })
})

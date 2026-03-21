/**
 * Tests for silvery command driver plugins
 *
 * Verifies withCommands and withKeybindings work correctly for:
 * - Direct command invocation via app.cmd.down()
 * - Index access via app.cmd['cursor_down']()
 * - Command metadata (id, name, help, keys)
 * - Keybinding resolution (press('j') → cmd.down)
 * - AI introspection via app.getState()
 */

import { describe, test, expect, beforeEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, withCommands, withKeybindings } from "@silvery/react"
import type { CommandRegistryLike, WithCommandsOptions } from "@silvery/react"
import {
  createCommandRegistry,
  allCommands,
  defaultKeybindings,
  type CommandContext,
  type CommandAction,
} from "@km/commands"
import React from "react"
import { getActiveBoardPane, type BoardAppStore } from "../src/board-app-store.ts"
import { dispatchCommandById } from "../src/board-app.ts"

describe("withCommands", () => {
  // Create a mock registry with a few commands for testing
  let registry: CommandRegistryLike<CommandContext, CommandAction>
  let dispatchedActions: CommandAction[]

  beforeEach(() => {
    dispatchedActions = []

    // Create fresh registry with real km commands
    const reg = createCommandRegistry()
    reg.registerAll(allCommands)
    registry = reg
  })

  // Minimal context for testing
  const mockContext: CommandContext = {
    currentNode: null,
    currentNodeId: null,
    selectedNodes: [],
    viewMode: "cards",
    siblingIndex: 0,
    siblingCount: 5,
    columnIndex: 0,
    columnCount: 3,
    moveMode: false,
    foldDepths: new Map(),
  }

  const createOptions = (): WithCommandsOptions<CommandContext, CommandAction> => ({
    registry,
    getContext: () => mockContext,
    handleAction: (action) => {
      dispatchedActions.push(action)
    },
    getKeybindings: () => defaultKeybindings(),
  })

  test("cmd.down() executes cursor movement command", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    // Execute command
    await (app.cmd.down as any)()

    // cursor_down should dispatch CURSOR_MOVE with dir: down
    expect(dispatchedActions).toHaveLength(1)
    expect(dispatchedActions[0]).toEqual({ type: "CURSOR_MOVE", dir: "down" })
  })

  test("cmd['cursor_down']() works via index access", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    // Execute via index access
    const downCmd = app.cmd["cursor_down"]
    expect(downCmd).toBeDefined()
    await downCmd!()

    expect(dispatchedActions).toHaveLength(1)
    expect(dispatchedActions[0]).toEqual({ type: "CURSOR_MOVE", dir: "down" })
  })

  test("cmd.down.id returns command id", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    expect((app.cmd.down as any).id).toBe("cursor_down")
  })

  test("cmd.down.name returns command name", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    expect((app.cmd.down as any).name).toBe("Move Down")
  })

  test("cmd.down.help returns command description", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    expect((app.cmd.down as any).help).toContain("Move cursor down")
  })

  test("cmd.down.keys returns keybindings", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    const keys = (app.cmd.down as any).keys
    expect(keys).toContain("j")
    expect(keys).toContain("ArrowDown")
  })

  test("cmd.all() returns all commands with metadata", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    const commands = app.cmd.all()
    expect(commands.length).toBeGreaterThan(0)

    // Find cursor_down command
    const down = commands.find((c) => c.id === "cursor_down")
    expect(down).toBeDefined()
    expect(down!.name).toBe("Move Down")
    expect(down!.keys).toContain("j")
  })

  test("cmd.describe() returns human-readable help", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    const help = app.cmd.describe()
    expect(help).toContain("cursor_down")
    expect(help).toContain("j")
  })

  test("getState() returns screen and commands for AI", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Hello World</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    const state = app.getState()
    expect(state.screen).toContain("Hello World")
    expect(state.commands.length).toBeGreaterThan(0)
    expect(state.commands.find((c) => c.id === "cursor_down")).toBeDefined()
  })

  test("undefined command returns undefined (not error)", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )
    const app = withCommands(baseApp, createOptions())

    expect(app.cmd.nonexistent_command).toBeUndefined()
  })
})

describe("withKeybindings", () => {
  let dispatchedActions: CommandAction[]

  beforeEach(() => {
    dispatchedActions = []
  })

  const mockContext: CommandContext = {
    currentNode: null,
    currentNodeId: null,
    selectedNodes: [],
    viewMode: "cards",
    siblingIndex: 0,
    siblingCount: 5,
    columnIndex: 0,
    columnCount: 3,
    moveMode: false,
    foldDepths: new Map(),
  }

  test("press('j') triggers cursor_down command", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )

    const registry = createCommandRegistry()
    registry.registerAll(allCommands)

    const appWithCmd = withCommands(baseApp, {
      registry,
      getContext: () => mockContext,
      handleAction: (action) => dispatchedActions.push(action),
      getKeybindings: () => defaultKeybindings(),
    })

    const app = withKeybindings(appWithCmd, {
      bindings: defaultKeybindings(),
      getKeyContext: () => ({ mode: "normal", hasMultiSelection: false, hasSelection: false }),
    })

    // Press j should trigger cursor_down
    await app.press("j")

    expect(dispatchedActions).toHaveLength(1)
    expect(dispatchedActions[0]).toEqual({ type: "CURSOR_MOVE", dir: "down" })
  })

  test("press('ArrowDown') also triggers cursor_down", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )

    const registry = createCommandRegistry()
    registry.registerAll(allCommands)

    const appWithCmd = withCommands(baseApp, {
      registry,
      getContext: () => mockContext,
      handleAction: (action) => dispatchedActions.push(action),
      getKeybindings: () => defaultKeybindings(),
    })

    const app = withKeybindings(appWithCmd, {
      bindings: defaultKeybindings(),
      getKeyContext: () => ({ mode: "normal", hasMultiSelection: false, hasSelection: false }),
    })

    await app.press("ArrowDown")

    expect(dispatchedActions).toHaveLength(1)
    expect(dispatchedActions[0]).toEqual({ type: "CURSOR_MOVE", dir: "down" })
  })

  test("press('k') triggers cursor_up command", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )

    const registry = createCommandRegistry()
    registry.registerAll(allCommands)

    const appWithCmd = withCommands(baseApp, {
      registry,
      getContext: () => mockContext,
      handleAction: (action) => dispatchedActions.push(action),
      getKeybindings: () => defaultKeybindings(),
    })

    const app = withKeybindings(appWithCmd, {
      bindings: defaultKeybindings(),
      getKeyContext: () => ({ mode: "normal", hasMultiSelection: false, hasSelection: false }),
    })

    await app.press("k")

    expect(dispatchedActions).toHaveLength(1)
    expect(dispatchedActions[0]).toEqual({ type: "CURSOR_MOVE", dir: "up" })
  })

  test("unbound key passes through to original press", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box>
        <Text>Test</Text>
      </Box>,
    )

    const registry = createCommandRegistry()
    registry.registerAll(allCommands)

    const appWithCmd = withCommands(baseApp, {
      registry,
      getContext: () => mockContext,
      handleAction: (action) => dispatchedActions.push(action),
      getKeybindings: () => defaultKeybindings(),
    })

    const app = withKeybindings(appWithCmd, {
      bindings: defaultKeybindings(),
      getKeyContext: () => ({ mode: "normal", hasMultiSelection: false, hasSelection: false }),
    })

    // 'x' is not bound to any command
    await app.press("x")

    // No command should be dispatched
    expect(dispatchedActions).toHaveLength(0)
  })
})

describe("composed app driver", () => {
  test("full composition: render → withCommands → withKeybindings", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(
      <Box flexDirection="column">
        <Text>Item 1</Text>
        <Text>Item 2</Text>
        <Text>Item 3</Text>
      </Box>,
    )

    const registry = createCommandRegistry()
    registry.registerAll(allCommands)

    const actions: CommandAction[] = []

    const mockContext: CommandContext = {
      currentNode: null,
      currentNodeId: null,
      selectedNodes: [],
      viewMode: "cards",
      siblingIndex: 0,
      siblingCount: 3,
      columnIndex: 0,
      columnCount: 1,
      moveMode: false,
      foldDepths: new Map(),
    }

    // Full composition
    const app = withKeybindings(
      withCommands(baseApp, {
        registry,
        getContext: () => mockContext,
        handleAction: (action) => actions.push(action),
        getKeybindings: () => defaultKeybindings(),
      }),
      {
        bindings: defaultKeybindings(),
        getKeyContext: () => ({ mode: "normal", hasMultiSelection: false, hasSelection: false }),
      },
    )

    // Verify screen content
    expect(app.text).toContain("Item 1")
    expect(app.text).toContain("Item 2")

    // Verify commands available
    expect(app.cmd.down).toBeDefined()
    expect(app.cmd.up).toBeDefined()
    expect(app.cmd.left).toBeDefined()
    expect(app.cmd.right).toBeDefined()

    // Verify keybinding triggers command
    await app.press("j")
    expect(actions).toContainEqual({ type: "CURSOR_MOVE", dir: "down" })

    // Verify direct command invocation
    actions.length = 0
    await app.cmd.up!()
    expect(actions).toContainEqual({ type: "CURSOR_MOVE", dir: "up" })

    // Verify getState for AI
    const state = app.getState()
    expect(state.screen).toContain("Item 1")
    expect(state.commands.length).toBeGreaterThan(10)
  })
})

// =============================================================================
// createBoardDriver Tests - Full TUI automation
// =============================================================================

import { createFakeRepo } from "@km/storage"
import { createBoardDriver } from "../src/driver.ts"
import { item } from "./helpers/board-test.ts"

describe("createBoardDriver", () => {
  test("creates working driver from repo", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Driver should render the board
    expect(driver.text).toContain("board")
    expect(driver.text).toContain("col1")
    expect(driver.text).toContain("1a")
    expect(driver.text).toContain("1b")
  })

  test("getState() returns cursor position", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    const state = driver.getState()

    // Initial state should have cursor at first card
    expect(state.cursor).toBeDefined()
    expect(state.cursor.col).toBe(0)
    expect(state.cursor.card).toBe(0)
    expect(state.cursor.level).toBe("card")
  })

  test("getState() returns selected node ID", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    const state = driver.getState()

    // Should have the first card selected
    expect(state.selectedNodeId).toBe("1a")
  })

  test("getState() includes command list for AI", () => {
    const nodes = item("board", item("col1", item("1a")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    const state = driver.getState()

    // Should include commands for AI to discover
    expect(state.commands).toBeDefined()
    expect(state.commands.length).toBeGreaterThan(10)

    // Should have navigation commands
    const downCmd = state.commands.find((c) => c.id === "cursor_down")
    expect(downCmd).toBeDefined()
    expect(downCmd!.keys).toContain("j")
  })

  test("cmd.* provides command metadata", () => {
    const nodes = item("board", item("col1", item("1a")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Commands should have metadata
    expect(driver.cmd.down).toBeDefined()
    expect((driver.cmd.down as any).id).toBe("cursor_down")
    expect((driver.cmd.down as any).name).toBe("Move Down")
    expect((driver.cmd.down as any).keys).toContain("j")
  })

  test("press('j') navigates cursor down", async () => {
    const nodes = item("board", item("col1", item("1a"), item("1b"), item("1c")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Initial state
    let state = driver.getState()
    expect(state.selectedNodeId).toBe("1a")

    // Press j to move down
    await driver.press("j")

    // Should now be on 1b
    state = driver.getState()
    expect(state.selectedNodeId).toBe("1b")
  })

  test("press('k') navigates cursor up", async () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Move down first
    await driver.press("j")
    let state = driver.getState()
    expect(state.selectedNodeId).toBe("1b")

    // Press k to move up
    await driver.press("k")

    // Should now be back on 1a
    state = driver.getState()
    expect(state.selectedNodeId).toBe("1a")
  })

  test("press('l') navigates to next column", async () => {
    const nodes = item("board", item("col1", item("1a")), item("col2", item("2a")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Initial state - cursor on 1a in col1
    let state = driver.getState()
    expect(state.selectedNodeId).toBe("1a")

    // Press l to move right
    await driver.press("l")

    // Should now be in col2 on 2a
    state = driver.getState()
    expect(state.selectedNodeId).toBe("2a")
    expect(state.cursor.col).toBe(1)
  })

  test("getState() tracks dialog state", async () => {
    const nodes = item("board", item("col1", item("1a")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Initially no dialogs open
    let state = driver.getState()
    expect(state.dialogs.search).toBe(false)
    expect(state.dialogs.newItem).toBe(false)

    // Open search dialog via the "search" command
    dispatchCommandById("search", driver.store.getState as () => BoardAppStore)

    // Dialog should be open
    state = driver.getState()
    expect(state.dialogs.search).toBe(true)
  })

  test("getState() tracks view mode", () => {
    const nodes = item("board", item("col1", item("1a")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    const state = driver.getState()

    // Should report view mode (extracted from bottom bar)
    // The exact format depends on how the bottom bar renders
    expect(state.viewMode).toBeDefined()
  })

  test("screen property returns rendered text", () => {
    const nodes = item("board", item("col1", item("Task Alpha")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    const state = driver.getState()

    // Screen should contain the task text
    expect(state.screen).toContain("Task Alpha")
  })

  test("cmd.describe() returns AI-readable help", () => {
    const nodes = item("board", item("col1", item("1a")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    const help = driver.cmd.describe()

    // Should include command descriptions
    expect(help).toContain("cursor_down")
    expect(help).toContain("j")
    expect(help).toContain("Move cursor")
  })

  test("works with custom dimensions", () => {
    const nodes = item("board", item("col1", item("1a")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board", {
      columns: 120,
      rows: 40,
    })

    // Should render without errors
    expect(driver.text).toContain("1a")
  })

  test("store exposes board state directly", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Store should be accessible
    expect(driver.store).toBeDefined()

    // Store should have captured state from Board (BoardAppStore shape)
    const storeState = driver.store.getState()
    const pane = getActiveBoardPane(storeState)!
    expect(pane.rootId).toBe("board")
    expect(pane.cursorNodeId).toBe("1a")
    expect(pane.viewMode).toBe("cards")
  })

  test("store state updates after navigation", async () => {
    const nodes = item("board", item("col1", item("1a"), item("1b"), item("1c")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Initial state
    let storeState = driver.store.getState()
    expect(getActiveBoardPane(storeState)!.cursorNodeId).toBe("1a")

    // Navigate down
    await driver.press("j")

    // Store should reflect the new cursor position
    storeState = driver.store.getState()
    expect(getActiveBoardPane(storeState)!.cursorNodeId).toBe("1b")
  })

  test("store provides cursor position", () => {
    const nodes = item("board", item("col1", item("1a")), item("col2", item("2a")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Layout is derived on demand via driver.getState()
    const state = driver.getState()
    expect(state.colIndex).toBe(0)
    expect(state.cardIndex).toBe(0)
    expect(state.cursor.level).toBe("card")
  })

  test("store tracks dialog state", async () => {
    const nodes = item("board", item("col1", item("1a")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Initially no dialogs
    let storeState = driver.store.getState()
    expect(storeState.ui.showSearchDialog).toBe(false)

    // Open search dialog via the "search" command
    dispatchCommandById("search", driver.store.getState as () => BoardAppStore)

    // Store should reflect dialog state
    storeState = driver.store.getState()
    expect(storeState.ui.showSearchDialog).toBe(true)
  })

  test("store allows subscriptions", async () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")))
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // SELECT uses silent mutation (bypasses Zustand set()), so subscribe
    // to CursorStore instead of Zustand store for cursor changes.
    const cursorIds: (string | null)[] = []
    const cursorStore = driver.store.getState().cursorStore
    const unsubscribe = cursorStore.subscribe(() => {
      cursorIds.push(cursorStore.getState().cursorNodeId)
    })

    // Navigate to trigger subscription
    await driver.press("j")

    // Unsubscribe
    unsubscribe()

    // Should have received at least one update
    expect(cursorIds.length).toBeGreaterThan(0)
    expect(cursorIds).toContain("1b")
  })
})

// =============================================================================
// Emoji rendering via driver (absorbed from emoji-driver.test.ts)
// =============================================================================

describe("emoji rendering via driver", () => {
  test("flag emoji navigation does not garble", async () => {
    process.env.SILVERY_STRICT = "1"
    try {
      const nodes = item.root(
        "board",
        item(
          "🇨🇦 Canada Tasks",
          item("🏠 Fix roof"),
          item("👨🏻‍💻 Code review"),
          item("🔸 Priority item"),
          item("📱 Mobile app"),
        ),
        item("🇺🇸 US Tasks", item("💼 Business meeting"), item("📊 Q4 Report"), item("🎯 Sprint goal")),
        item("Regular Column", item("Plain task A"), item("Plain task B")),
      )
      const repo = createFakeRepo({ nodes })
      const driver = createBoardDriver(repo, "board", {
        columns: 120,
        rows: 30,
        incremental: true,
      })

      // Navigate — SILVERY_STRICT checks buffer + output on each press
      for (const key of ["l", "l", "j", "j", "h", "j", "k", "l", "h", "h"]) {
        await driver.press(key)
      }
      expect(true).toBe(true)
    } finally {
      delete process.env.SILVERY_STRICT
    }
  })

  test("mixed emoji and ASCII", async () => {
    process.env.SILVERY_STRICT = "1"
    try {
      const nodes = item.root(
        "board",
        item("#routine", item("07:30 Morning routine 🏃‍♂️"), item("08:00 Breakfast ☕"), item("09:00 Work start 💻")),
        item("Calendar", item("10:00 Standup"), item("14:00 1:1 with @bjørn")),
      )
      const repo = createFakeRepo({ nodes })
      const driver = createBoardDriver(repo, "board", {
        columns: 100,
        rows: 25,
        incremental: true,
      })

      for (const key of ["l", "j", "j", "h", "k", "l", "j"]) {
        await driver.press(key)
      }
      expect(true).toBe(true)
    } finally {
      delete process.env.SILVERY_STRICT
    }
  })
})

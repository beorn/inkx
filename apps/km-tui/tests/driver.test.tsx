/**
 * Tests for inkx command driver plugins
 *
 * Verifies withCommands and withKeybindings work correctly for:
 * - Direct command invocation via app.cmd.down()
 * - Index access via app.cmd['cursor_down']()
 * - Command metadata (id, name, help, keys)
 * - Keybinding resolution (press('j') → cmd.down)
 * - AI introspection via app.getState()
 */

import { describe, test, expect, beforeEach } from "vitest"
import { createRenderer } from "inkx/testing"
import { Box, Text, withCommands, withKeybindings } from "inkx"
import type { CommandRegistryLike, WithCommandsOptions } from "inkx"
import {
  createCommandRegistry,
  allCommands,
  defaultKeybindings,
  type CommandContext,
  type CommandAction,
} from "@km/commands"
import React from "react"

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
    foldedNodes: new Set(),
  }

  const createOptions = (): WithCommandsOptions<CommandContext, CommandAction> => ({
    registry,
    getContext: () => mockContext,
    handleAction: (action) => {
      dispatchedActions.push(action)
    },
    getKeybindings: () => defaultKeybindings,
  })

  test("cmd.down() executes cursor movement command", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)
    const app = withCommands(baseApp, createOptions())

    // Execute command
    await app.cmd.down!()

    // cursor_down should dispatch CURSOR_MOVE with dir: down
    expect(dispatchedActions).toHaveLength(1)
    expect(dispatchedActions[0]).toEqual({ type: "CURSOR_MOVE", dir: "down" })
  })

  test("cmd['cursor_down']() works via index access", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)
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
    const baseApp = render(<Box><Text>Test</Text></Box>)
    const app = withCommands(baseApp, createOptions())

    expect(app.cmd.down!.id).toBe("cursor_down")
  })

  test("cmd.down.name returns command name", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)
    const app = withCommands(baseApp, createOptions())

    expect(app.cmd.down!.name).toBe("Move Down")
  })

  test("cmd.down.help returns command description", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)
    const app = withCommands(baseApp, createOptions())

    expect(app.cmd.down!.help).toContain("Move cursor down")
  })

  test("cmd.down.keys returns keybindings", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)
    const app = withCommands(baseApp, createOptions())

    const keys = app.cmd.down!.keys
    expect(keys).toContain("j")
    expect(keys).toContain("ArrowDown")
  })

  test("cmd.all() returns all commands with metadata", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)
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
    const baseApp = render(<Box><Text>Test</Text></Box>)
    const app = withCommands(baseApp, createOptions())

    const help = app.cmd.describe()
    expect(help).toContain("cursor_down")
    expect(help).toContain("j")
  })

  test("getState() returns screen and commands for AI", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Hello World</Text></Box>)
    const app = withCommands(baseApp, createOptions())

    const state = app.getState()
    expect(state.screen).toContain("Hello World")
    expect(state.commands.length).toBeGreaterThan(0)
    expect(state.commands.find((c) => c.id === "cursor_down")).toBeDefined()
  })

  test("undefined command returns undefined (not error)", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)
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
    foldedNodes: new Set(),
  }

  test("press('j') triggers cursor_down command", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)

    const registry = createCommandRegistry()
    registry.registerAll(allCommands)

    const appWithCmd = withCommands(baseApp, {
      registry,
      getContext: () => mockContext,
      handleAction: (action) => dispatchedActions.push(action),
      getKeybindings: () => defaultKeybindings,
    })

    const app = withKeybindings(appWithCmd, {
      bindings: defaultKeybindings,
      getKeyContext: () => ({ mode: "normal", hasSelection: false }),
    })

    // Press j should trigger cursor_down
    await app.press("j")

    expect(dispatchedActions).toHaveLength(1)
    expect(dispatchedActions[0]).toEqual({ type: "CURSOR_MOVE", dir: "down" })
  })

  test("press('ArrowDown') also triggers cursor_down", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)

    const registry = createCommandRegistry()
    registry.registerAll(allCommands)

    const appWithCmd = withCommands(baseApp, {
      registry,
      getContext: () => mockContext,
      handleAction: (action) => dispatchedActions.push(action),
      getKeybindings: () => defaultKeybindings,
    })

    const app = withKeybindings(appWithCmd, {
      bindings: defaultKeybindings,
      getKeyContext: () => ({ mode: "normal", hasSelection: false }),
    })

    await app.press("ArrowDown")

    expect(dispatchedActions).toHaveLength(1)
    expect(dispatchedActions[0]).toEqual({ type: "CURSOR_MOVE", dir: "down" })
  })

  test("press('k') triggers cursor_up command", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)

    const registry = createCommandRegistry()
    registry.registerAll(allCommands)

    const appWithCmd = withCommands(baseApp, {
      registry,
      getContext: () => mockContext,
      handleAction: (action) => dispatchedActions.push(action),
      getKeybindings: () => defaultKeybindings,
    })

    const app = withKeybindings(appWithCmd, {
      bindings: defaultKeybindings,
      getKeyContext: () => ({ mode: "normal", hasSelection: false }),
    })

    await app.press("k")

    expect(dispatchedActions).toHaveLength(1)
    expect(dispatchedActions[0]).toEqual({ type: "CURSOR_MOVE", dir: "up" })
  })

  test("unbound key passes through to original press", async () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const baseApp = render(<Box><Text>Test</Text></Box>)

    const registry = createCommandRegistry()
    registry.registerAll(allCommands)

    const appWithCmd = withCommands(baseApp, {
      registry,
      getContext: () => mockContext,
      handleAction: (action) => dispatchedActions.push(action),
      getKeybindings: () => defaultKeybindings,
    })

    const app = withKeybindings(appWithCmd, {
      bindings: defaultKeybindings,
      getKeyContext: () => ({ mode: "normal", hasSelection: false }),
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
      </Box>
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
      foldedNodes: new Set(),
    }

    // Full composition
    const app = withKeybindings(
      withCommands(baseApp, {
        registry,
        getContext: () => mockContext,
        handleAction: (action) => actions.push(action),
        getKeybindings: () => defaultKeybindings,
      }),
      {
        bindings: defaultKeybindings,
        getKeyContext: () => ({ mode: "normal", hasSelection: false }),
      }
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

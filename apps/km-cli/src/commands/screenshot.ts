/**
 * Screenshot Command - Capture TUI to text
 *
 * Renders the TUI to a terminal buffer and outputs as text.
 * Useful for debugging, snapshot testing, and CI visual verification.
 */

import { Command } from "@commander-js/extra-typings"
import { createLogger } from "loggily"
import { setDebugRepoRoot } from "../debug-log.ts"
import type { FullLogger } from "../logger-types.ts"

const log = createLogger("km:cli:screenshot") as FullLogger

type ViewMode = "cards" | "columns" | "list" | "tabs"
type OutputFormat = "text" | "ansi" | "debug"

const VIEW_MODES: ViewMode[] = ["cards", "columns", "list", "tabs"]

export const screenshotCommand = new Command("screenshot")
  .description("Capture TUI view as text (for debugging and testing)")
  .argument("[root]", "Root node ID, filesystem path, or directory to view")
  .option("--as <mode>", `View mode: ${VIEW_MODES.join(", ")} (default: cards)`, "cards")
  .option("--format <format>", "Output format: text (plain), ansi (styled), debug (with metadata)", "text")
  .option("--width <n>", "Terminal width", "80")
  .option("--height <n>", "Terminal height", "24")
  .option("-o, --output <file>", "Output file (default: stdout)")
  .action(async (root, options) => {
    log.debug?.("screenshot command", { root, ...options })

    const width = parseInt(options.width, 10)
    const height = parseInt(options.height, 10)
    const viewMode: ViewMode = VIEW_MODES.includes(options.as) ? (options.as as ViewMode) : "cards"
    const format: OutputFormat = options.format as OutputFormat

    // Import modules
    const [storageModule, coreModule, cliModule, tuiModule, silverytModule] = await Promise.all([
      import("@km/storage"),
      import("@km/core"),
      import("../program.ts"),
      import("@km/tui"),
      import("@silvery/react"),
    ])

    // Resolve path and load repo
    const resolved = storageModule.resolvePathArg(root, cliModule.getRootPath())
    setDebugRepoRoot(resolved.repoRoot)

    // Load repo (full parse for accurate screenshot)
    const repo = coreModule.runGenerator(storageModule.createRepo(resolved.repoRoot, { loadFiles: true }))

    // Resolve nodeRef to actual node ID (matches view.ts logic)
    let rootNodeId: string | undefined
    if (resolved.nodeRef) {
      const node = repo.resolveNode(resolved.nodeRef)
      rootNodeId = node?.id
    } else {
      // No specific node requested - use repo root folder node
      const repoRootNode = repo.getRepoRootNode()
      rootNodeId = repoRootNode?.id
    }

    // Initialize board state
    const state = coreModule.runGenerator(tuiModule.initBoardStateGenerator(repo, rootNodeId))

    if (!state) {
      console.error("Failed to initialize board state")
      process.exit(1)
    }

    state.rootPath = resolved.repoRoot

    // Import React and Board components
    const React = await import("react")
    const { BoardCore, RepoProvider, createInitialPaneUI } = await import("@km/tui")

    // Create the BoardCore element with all required props
    const boardCoreElement = React.createElement(BoardCore, {
      rootId: state.rootId,
      columns: state.columns,
      colIndex: 0,
      cardIndex: 0,
      ui: createInitialPaneUI("cards", [], { columns: width, rows: height }),
      derivedSelectionLevel: "card" as const,
      dimensions: { columns: width, rows: height },
      collapsedNodes: new Set<string>(),
      hasDetailPane: false,
    })

    // Create element wrapped in RepoProvider
    const element = React.createElement(RepoProvider, {
      repo: repo,
      children: boardCoreElement,
    })

    // Use renderStatic for one-shot rendering (production code)
    const plain = format === "text" || format === "debug"
    const rendered = await silverytModule.renderStatic(element, {
      width,
      height,
      plain,
    })

    // Generate output based on format
    let output: string
    switch (format) {
      case "text":
      case "ansi":
        output = rendered
        break
      case "debug":
        output = [
          `# TUI Screenshot`,
          `# Dimensions: ${width}x${height}`,
          `# View: ${viewMode}`,
          `# Root: ${resolved.repoRoot}`,
          `# Node: ${resolved.nodeRef ?? "(root)"}`,
          ``,
          rendered,
        ].join("\n")
        break
      default:
        output = rendered
    }

    // Output to file or stdout
    if (options.output) {
      const fs = await import("fs")
      fs.writeFileSync(options.output, output)
      console.error(`Screenshot saved to ${options.output}`)
    } else {
      console.log(output)
    }
  })

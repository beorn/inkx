/**
 * Screenshot Command - Capture TUI to text
 *
 * Renders the TUI to a terminal buffer and outputs as text.
 * Useful for debugging, snapshot testing, and CI visual verification.
 */

import { Command } from "@commander-js/extra-typings"
import createDebug from "debug"
import { setDebugRepoRoot } from "../debug-log.ts"

const debug = createDebug("km:cli:screenshot")

type ViewMode = "cards" | "columns" | "list" | "tabs"
type OutputFormat = "text" | "ansi" | "debug"

const VIEW_MODES: ViewMode[] = ["cards", "columns", "list", "tabs"]

export const screenshotCommand = new Command("screenshot")
  .description("Capture TUI view as text (for debugging and testing)")
  .argument("[root]", "Root node ID, filesystem path, or directory to view")
  .option(
    "--as <mode>",
    `View mode: ${VIEW_MODES.join(", ")} (default: cards)`,
    "cards",
  )
  .option(
    "--format <format>",
    "Output format: text (plain), ansi (styled), debug (with metadata)",
    "text",
  )
  .option("--width <n>", "Terminal width", "80")
  .option("--height <n>", "Terminal height", "24")
  .option("-o, --output <file>", "Output file (default: stdout)")
  .action(async (root, options) => {
    debug("screenshot command", { root, ...options })

    const width = parseInt(options.width, 10)
    const height = parseInt(options.height, 10)
    const viewMode = VIEW_MODES.includes(options.as) ? options.as : "cards"
    const format: OutputFormat = options.format as OutputFormat

    // Import modules
    const [storageModule, cliModule, tuiModule, inkxTesting] =
      await Promise.all([
        import("@km/storage"),
        import("../program.ts"),
        import("@km/tui"),
        import("inkx/testing"),
      ])

    // Resolve path and load repo
    const resolved = storageModule.resolvePathArg(root, cliModule.getRootPath())
    setDebugRepoRoot(resolved.repoRoot)

    // Load repo (full parse for accurate screenshot)
    const repo = storageModule.runGenerator(
      storageModule.createRepo(resolved.repoRoot, { loadFiles: true }),
    )

    // Initialize board state
    const state = storageModule.runGenerator(
      tuiModule.initBoardStateGenerator(repo, resolved.nodeRef ?? undefined),
    )

    if (!state) {
      console.error("Failed to initialize board state")
      process.exit(1)
    }

    state.rootPath = resolved.repoRoot

    // Create test renderer with specified dimensions
    const render = inkxTesting.createTestRenderer({
      columns: width,
      rows: height,
    })

    // Import React and Board components
    const React = await import("react")
    const {
      BoardCore,
      RepoProvider,
      createInitialUIState,
      createLayoutRegistry,
    } = await import("@km/tui")

    // Create the BoardCore element with all required props
    const boardCoreElement = React.createElement(BoardCore, {
      state,
      ui: createInitialUIState(viewMode, [], { columns: width, rows: height }),
      derivedSelectionLevel: "card" as const,
      dimensions: { columns: width, rows: height },
      layoutRegistry: createLayoutRegistry(),
      dispatch: () => {},
      dialogHandlers: {
        handleProjectSelect: () => {},
        handleProjectCancel: () => {},
        handleNewItemCreate: () => {},
        handleNewItemCancel: () => {},
      },
    })

    // Render the board wrapped in RepoProvider
    const { lastBuffer, lastFrameText } = render(
      React.createElement(RepoProvider, {
        repo: repo,
        children: boardCoreElement,
      }),
    )

    // Generate output based on format
    let output: string
    const buffer = lastBuffer()

    if (!buffer) {
      console.error("Failed to render buffer")
      process.exit(1)
    }

    switch (format) {
      case "text":
        output = lastFrameText() ?? ""
        break
      case "ansi":
        output = inkxTesting.bufferToStyledText(buffer)
        break
      case "debug": {
        const text = lastFrameText() ?? ""
        output = [
          `# TUI Screenshot`,
          `# Dimensions: ${width}x${height}`,
          `# View: ${viewMode}`,
          `# Root: ${resolved.repoRoot}`,
          `# Node: ${resolved.nodeRef ?? "(root)"}`,
          ``,
          text,
        ].join("\n")
        break
      }
      default:
        output = lastFrameText() ?? ""
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

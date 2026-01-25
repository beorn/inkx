/**
 * Screenshot Command - Capture TUI to text
 *
 * Renders the TUI to a terminal buffer and outputs as text.
 * Useful for debugging, snapshot testing, and CI visual verification.
 */

import { Command } from "commander";
import createDebug from "debug";
import { setDebugVaultRoot } from "../debug-log.ts";

const debug = createDebug("km:cli:screenshot");

type ViewMode = "cards" | "columns" | "list" | "tabs";
type OutputFormat = "text" | "ansi" | "debug";

const VIEW_MODES: ViewMode[] = ["cards", "columns", "list", "tabs"];

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
    debug("screenshot command", { root, ...options });

    const width = parseInt(options.width, 10);
    const height = parseInt(options.height, 10);
    const viewMode = VIEW_MODES.includes(options.as) ? options.as : "cards";
    const format: OutputFormat = options.format as OutputFormat;

    // Import modules
    const [storageModule, cliModule, tuiModule, inkxTesting] =
      await Promise.all([
        import("@km/storage"),
        import("../index.ts"),
        import("@km/tui"),
        import("inkx/testing"),
      ]);

    // Resolve path and load vault
    const resolved = storageModule.resolvePathArg(
      root,
      cliModule.getRootPath(),
    );
    setDebugVaultRoot(resolved.vaultRoot);

    // Load vault (full parse for accurate screenshot)
    const vault = storageModule.runGenerator(
      storageModule.createVault(resolved.vaultRoot, {
        searchAncestors: false,
        discoverOnly: false,
      }),
    );

    // Initialize board state
    const state = storageModule.runGenerator(
      tuiModule.initBoardStateGenerator(vault, resolved.nodeRef ?? undefined),
    );

    if (!state) {
      console.error("Failed to initialize board state");
      process.exit(1);
    }

    state.rootPath = resolved.vaultRoot;

    // Create test renderer with specified dimensions
    const render = inkxTesting.createTestRenderer({
      columns: width,
      rows: height,
    });

    // Import React and Board component
    const React = await import("react");
    const { InkBoardTestable } = await import("@km/tui");

    // Render the board
    // Note: InkBoardTestable uses fixed dimensions, view mode is currently "cards" only
    const { lastBuffer, lastFrameText } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: width,
        testHeight: height,
        vault: storageModule.createFakeVault(),
      }),
    );

    // Generate output based on format
    let output: string;
    const buffer = lastBuffer();

    if (!buffer) {
      console.error("Failed to render buffer");
      process.exit(1);
    }

    switch (format) {
      case "text":
        output = lastFrameText() ?? "";
        break;
      case "ansi":
        output = inkxTesting.bufferToStyledText(buffer);
        break;
      case "debug": {
        const text = lastFrameText() ?? "";
        output = [
          `# TUI Screenshot`,
          `# Dimensions: ${width}x${height}`,
          `# View: ${viewMode}`,
          `# Root: ${resolved.vaultRoot}`,
          `# Node: ${resolved.nodeRef ?? "(root)"}`,
          ``,
          text,
        ].join("\n");
        break;
      }
      default:
        output = lastFrameText() ?? "";
    }

    // Output to file or stdout
    if (options.output) {
      const fs = await import("fs");
      fs.writeFileSync(options.output, output);
      console.error(`Screenshot saved to ${options.output}`);
    } else {
      console.log(output);
    }
  });

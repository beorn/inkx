/**
 * TUI2 Visual Regression Test Setup
 *
 * Utilities for headless visual testing of the TUI using ttyd + Playwright.
 * This setup enables capturing screenshots of the terminal UI without
 * taking over the user's screen.
 *
 * Usage:
 *   1. Start TUI in headless terminal: await startTui2Headless(vault, file)
 *   2. Capture screenshot: await captureTui2Screenshot()
 *   3. Clean up: await cleanup()
 *
 * Prerequisites:
 *   - ttyd installed (brew install ttyd)
 *   - playwright installed (bun add -d playwright)
 *
 * @module
 */

import { spawn, type ChildProcess } from "child_process";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

export interface Tui2Session {
  process: ChildProcess;
  port: number;
  cleanup: () => Promise<void>;
}

export interface CaptureOptions {
  port?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  outputPath?: string;
  waitMs?: number;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Start TUI2 in a headless terminal using ttyd
 *
 * @param vault - Path to the test vault directory
 * @param file - Optional file path within the vault
 * @param port - Port for ttyd web server (default: 7681)
 * @returns Session object with cleanup function
 *
 * @example
 * ```typescript
 * const session = await startTui2Headless("/tmp/test-vault", "@next.md");
 * try {
 *   const screenshot = await captureTui2Screenshot({ port: session.port });
 *   // ... assertions
 * } finally {
 *   await session.cleanup();
 * }
 * ```
 */
export async function startTui2Headless(
  vault: string,
  file?: string,
  port = 7681,
): Promise<Tui2Session> {
  // Kill any existing ttyd process on this port
  try {
    const killProcess = spawn("pkill", ["-f", `ttyd.*-p ${port}`]);
    await new Promise<void>((resolve) => {
      killProcess.on("close", () => resolve());
      setTimeout(resolve, 500); // Timeout if pkill hangs
    });
  } catch {
    // Ignore errors if no process to kill
  }

  // Build the km command
  const kmArgs = ["km", "view", "-r", vault];
  if (file) {
    kmArgs.push(file);
  }

  // Start ttyd with the TUI
  // -W: writable (allow input)
  // -p: port
  const ttydArgs = ["-W", "-p", String(port), "bun", ...kmArgs];
  const ttydProcess = spawn("ttyd", ttydArgs, {
    stdio: "pipe",
    detached: false,
  });

  // Wait for ttyd to be ready
  await waitForPort(port, 5000);

  const cleanup = async (): Promise<void> => {
    // Gracefully terminate the process
    ttydProcess.kill("SIGTERM");

    // Wait a bit for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        ttydProcess.kill("SIGKILL");
        resolve();
      }, 1000);

      ttydProcess.on("close", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  };

  return {
    process: ttydProcess,
    port,
    cleanup,
  };
}

// ============================================================================
// Screenshot Capture
// ============================================================================

/**
 * Capture a screenshot of the TUI using Playwright
 *
 * @param options - Capture options
 * @returns Screenshot as a Buffer, or saves to outputPath if specified
 *
 * @example
 * ```typescript
 * // Get screenshot as buffer
 * const buffer = await captureTui2Screenshot({ port: 7681 });
 *
 * // Save to file
 * await captureTui2Screenshot({
 *   port: 7681,
 *   outputPath: "/tmp/tui-screenshot.png"
 * });
 * ```
 */
export async function captureTui2Screenshot(
  options: CaptureOptions = {},
): Promise<Buffer | void> {
  const {
    port = 7681,
    viewportWidth = 1400,
    viewportHeight = 900,
    outputPath,
    waitMs = 500,
  } = options;

  // Dynamic import to avoid loading playwright unless needed
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });

  try {
    const context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
    });
    const page = await context.newPage();

    // Navigate to ttyd web interface
    await page.goto(`http://localhost:${port}`, {
      waitUntil: "networkidle",
    });

    // Wait for terminal to render
    await page.waitForTimeout(waitMs);

    // Capture screenshot
    if (outputPath) {
      await page.screenshot({ path: outputPath });
    } else {
      return await page.screenshot();
    }
  } finally {
    await browser.close();
  }
}

// ============================================================================
// Comparison Utilities
// ============================================================================

/**
 * Compare two screenshots and return similarity percentage
 *
 * This is a basic pixel comparison. For production use, consider
 * using a more sophisticated image comparison library like pixelmatch.
 *
 * @param baseline - Baseline screenshot buffer
 * @param current - Current screenshot buffer
 * @returns Similarity percentage (0-100)
 */
export async function compareScreenshots(
  baseline: Buffer,
  current: Buffer,
): Promise<number> {
  // Basic implementation - compare buffer lengths as a rough check
  // A proper implementation would use pixelmatch or similar
  if (baseline.length === current.length) {
    let matches = 0;
    for (let i = 0; i < baseline.length; i++) {
      if (baseline[i] === current[i]) {
        matches++;
      }
    }
    return (matches / baseline.length) * 100;
  }

  // Different sizes means different screenshots
  return 0;
}

// ============================================================================
// Test Vault Setup
// ============================================================================

/**
 * Create a temporary test vault with sample files
 *
 * @param basePath - Base directory for the vault
 * @returns Path to the created vault
 */
export async function createTestVault(basePath: string): Promise<string> {
  const vaultPath = join(basePath, "test-vault");

  // Create vault directory
  await mkdir(vaultPath, { recursive: true });

  // Create a sample board file
  const boardContent = `# Test Board

## Todo
- [ ] First task
- [ ] Second task
- [/] Task in progress

## In Progress
- [/] Working on this
- [!] Blocked task

## Done
- [x] Completed task
`;

  await writeFile(join(vaultPath, "board.md"), boardContent);

  // Create a simple tasks file
  const tasksContent = `# Tasks

- [ ] Simple task
- [x] Done task
`;

  await writeFile(join(vaultPath, "tasks.md"), tasksContent);

  return vaultPath;
}

/**
 * Clean up a test vault
 *
 * @param vaultPath - Path to the vault to remove
 */
export async function cleanupTestVault(vaultPath: string): Promise<void> {
  await rm(vaultPath, { recursive: true, force: true });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wait for a port to become available
 *
 * @param port - Port to wait for
 * @param timeoutMs - Maximum time to wait
 */
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.ok || response.status === 426) {
        // 426 = Upgrade Required (websocket), which is fine for ttyd
        return;
      }
    } catch {
      // Port not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout waiting for port ${port} after ${timeoutMs}ms`);
}

/**
 * Send keyboard input to ttyd
 *
 * Note: This requires websocket connection to ttyd.
 * For now, this is a placeholder for future implementation.
 *
 * @param port - ttyd port
 * @param input - Input string to send
 */
export async function sendInput(port: number, input: string): Promise<void> {
  // TODO: Implement websocket-based input sending
  // This would involve connecting to ws://localhost:${port}/ws
  // and sending the input through the terminal pty
  console.log(`[Visual Test] Would send input "${input}" to port ${port}`);
}

// ============================================================================
// Exports
// ============================================================================

export default {
  startTui2Headless,
  captureTui2Screenshot,
  compareScreenshots,
  createTestVault,
  cleanupTestVault,
  sendInput,
};

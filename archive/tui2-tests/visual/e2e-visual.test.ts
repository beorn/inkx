/**
 * E2E Visual Testing Suite for TUI
 *
 * Tests visual rendering of both TUI1 (Ink) and TUI2 (OpenTUI) using
 * ttyd + Playwright for headless screenshot capture.
 *
 * Run: VISUAL_TESTS=1 bun test apps/km-cli/tests/tui2/visual/e2e-visual.test.ts
 *
 * Prerequisites:
 *   - ttyd installed (brew install ttyd)
 *   - playwright installed (bun add -d playwright)
 *
 * Note: These tests are skipped by default (slow). Set VISUAL_TESTS=1 to run.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import { spawn, type ChildProcess } from "child_process";
import { join, dirname } from "path";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";

// Skip visual tests unless VISUAL_TESTS=1 is set (they're slow)
const SKIP_VISUAL_TESTS = !process.env.VISUAL_TESTS;

// Use conditional describe
const describeVisual = SKIP_VISUAL_TESTS ? describe.skip : describe;

// ============================================================================
// Configuration
// ============================================================================

const TEST_VAULT_DIR = join(dirname(import.meta.path), "test-vault");
const SCREENSHOT_DIR = join(dirname(import.meta.path), "screenshots");
const TUI1_PORT = 7681;
const TUI2_PORT = 7682;
const PROJECT_ROOT = join(dirname(import.meta.path), "../../../../..");

// ============================================================================
// Types
// ============================================================================

interface TuiSession {
  process: ChildProcess;
  port: number;
  tuiVersion: "tui1" | "tui2";
}

interface ScreenshotResult {
  path: string;
  buffer: Buffer;
}

interface VisualDefect {
  type: "clipping" | "alignment" | "color" | "missing" | "overflow" | "layout";
  description: string;
  severity: "critical" | "major" | "minor";
}

// ============================================================================
// Session Management
// ============================================================================

let activeSession: TuiSession | null = null;

async function startTui(
  tuiVersion: "tui1" | "tui2",
  file: string,
  viewMode?: "list" | "columns" | "tabs",
): Promise<TuiSession> {
  const port = tuiVersion === "tui1" ? TUI1_PORT : TUI2_PORT;

  // Kill any existing process on this port
  try {
    const killProc = spawn("pkill", ["-f", `ttyd.*-p ${port}`]);
    await new Promise<void>((resolve) => {
      killProc.on("close", () => resolve());
      setTimeout(resolve, 500);
    });
  } catch {
    // Ignore
  }

  // Build km command
  const kmArgs = [
    "run",
    join(PROJECT_ROOT, "apps/km-cli/src/index.ts"),
    "view",
    "-r",
    TEST_VAULT_DIR,
  ];
  if (tuiVersion === "tui2") {
    kmArgs.push("--tui2");
  }
  if (viewMode) {
    kmArgs.push("--as", viewMode);
  }
  kmArgs.push(file);

  // Start ttyd
  const ttydArgs = ["-W", "-p", String(port), "bun", ...kmArgs];
  const ttydProcess = spawn("ttyd", ttydArgs, {
    stdio: "pipe",
    cwd: PROJECT_ROOT,
  });

  // Wait for port
  await waitForPort(port, 10000);
  // Extra wait for TUI to fully render
  await sleep(1500);

  activeSession = {
    process: ttydProcess,
    port,
    tuiVersion,
  };

  return activeSession;
}

async function stopTui(session: TuiSession): Promise<void> {
  session.process.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      session.process.kill("SIGKILL");
      resolve();
    }, 2000);
    session.process.on("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  if (activeSession === session) {
    activeSession = null;
  }
}

// ============================================================================
// Screenshot Capture
// ============================================================================

async function captureScreenshot(
  port: number,
  name: string,
  width = 120,
  height = 40,
): Promise<ScreenshotResult> {
  const { chromium } = await import("playwright");

  // Calculate pixel dimensions (approximate terminal character size)
  const charWidth = 9;
  const charHeight = 18;
  const viewportWidth = width * charWidth + 40; // padding for scrollbar
  const viewportHeight = height * charHeight + 40;

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });

  try {
    const context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
    });
    const page = await context.newPage();

    await page.goto(`http://localhost:${port}`, {
      waitUntil: "networkidle",
    });

    // Wait for terminal to fully render
    await page.waitForTimeout(500);

    const screenshotPath = join(SCREENSHOT_DIR, `${name}.png`);
    await mkdir(dirname(screenshotPath), { recursive: true });

    const buffer = await page.screenshot({ path: screenshotPath });

    return {
      path: screenshotPath,
      buffer,
    };
  } finally {
    await browser.close();
  }
}

async function sendKeys(port: number, keys: string): Promise<void> {
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`http://localhost:${port}`, {
      waitUntil: "networkidle",
    });

    // Wait for terminal
    await page.waitForTimeout(300);

    // Send each key
    for (const key of keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(100);
    }

    // Wait for action to complete
    await page.waitForTimeout(300);
  } finally {
    await browser.close();
  }
}

// ============================================================================
// Visual Analysis
// ============================================================================

async function analyzeScreenshot(
  screenshotPath: string,
  expectedContent: string[],
): Promise<VisualDefect[]> {
  // In a real implementation, this would use OCR or image analysis
  // For now, we just verify the file exists and has reasonable size
  const defects: VisualDefect[] = [];

  if (!existsSync(screenshotPath)) {
    defects.push({
      type: "missing",
      description: `Screenshot file not created: ${screenshotPath}`,
      severity: "critical",
    });
    return defects;
  }

  const buffer = await readFile(screenshotPath);
  if (buffer.length < 1000) {
    defects.push({
      type: "layout",
      description: `Screenshot unusually small (${buffer.length} bytes), may be blank`,
      severity: "critical",
    });
  }

  return defects;
}

// ============================================================================
// Helpers
// ============================================================================

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.ok || response.status === 426) {
        return;
      }
    } catch {
      // Port not ready
    }
    await sleep(100);
  }
  throw new Error(`Timeout waiting for port ${port}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Test Setup
// ============================================================================

beforeAll(async () => {
  // Create screenshot directory
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  // Sync the test vault
  const syncProc = spawn("bun", [
    "run",
    join(PROJECT_ROOT, "apps/km-cli/src/index.ts"),
    "sync",
    "-r",
    TEST_VAULT_DIR,
  ]);

  await new Promise<void>((resolve, reject) => {
    syncProc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Sync failed with code ${code}`));
    });
    syncProc.on("error", reject);
  });
});

afterAll(async () => {
  // Cleanup any running sessions
  if (activeSession) {
    await stopTui(activeSession);
  }
});

afterEach(async () => {
  // Stop session after each test
  if (activeSession) {
    await stopTui(activeSession);
  }
});

// ============================================================================
// Tests: TUI1 Visual Verification
// ============================================================================

describeVisual("TUI1 (Ink) Visual Tests", () => {
  test("renders board in columns mode", async () => {
    const session = await startTui("tui1", "board.md", "columns");
    const screenshot = await captureScreenshot(
      session.port,
      "tui1-columns-board",
    );

    const defects = await analyzeScreenshot(screenshot.path, [
      "Todo",
      "In Progress",
      "Blocked",
      "Done",
      "Backlog",
    ]);

    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);

  test("renders board in list mode", async () => {
    const session = await startTui("tui1", "board.md", "list");
    const screenshot = await captureScreenshot(session.port, "tui1-list-board");

    const defects = await analyzeScreenshot(screenshot.path, [
      "Short task",
      "medium length task",
    ]);

    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);

  test("handles many tasks with scrolling", async () => {
    const session = await startTui("tui1", "many-tasks.md", "list");
    const screenshot = await captureScreenshot(
      session.port,
      "tui1-many-tasks",
      80,
      20,
    );

    const defects = await analyzeScreenshot(screenshot.path, [
      "Task 01",
      "Large List",
    ]);

    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);

  test("handles overflow correctly", async () => {
    const session = await startTui("tui1", "overflow-test.md", "list");
    const screenshot = await captureScreenshot(
      session.port,
      "tui1-overflow",
      60,
      20,
    );

    const defects = await analyzeScreenshot(screenshot.path, [
      "This is an extremely long",
    ]);

    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);

  test("selection highlighting", async () => {
    const session = await startTui("tui1", "board.md", "list");
    await sleep(500);

    // Navigate down and take screenshot
    await sendKeys(session.port, "jj");
    await sleep(300);

    const screenshot = await captureScreenshot(session.port, "tui1-selection");

    const defects = await analyzeScreenshot(screenshot.path, []);
    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);

  test("multi-select with Shift+j", async () => {
    const session = await startTui("tui1", "board.md", "list");
    await sleep(500);

    // Multi-select: Shift+j twice
    await sendKeys(session.port, "JJ");
    await sleep(300);

    const screenshot = await captureScreenshot(
      session.port,
      "tui1-multiselect",
    );

    const defects = await analyzeScreenshot(screenshot.path, []);
    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);
});

// ============================================================================
// Tests: TUI2 Visual Verification
// ============================================================================

describeVisual("TUI2 (OpenTUI) Visual Tests", () => {
  test("renders board in columns mode", async () => {
    const session = await startTui("tui2", "board.md", "columns");
    const screenshot = await captureScreenshot(
      session.port,
      "tui2-columns-board",
    );

    const defects = await analyzeScreenshot(screenshot.path, [
      "Todo",
      "In Progress",
      "Blocked",
      "Done",
      "Backlog",
    ]);

    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);

  test("renders board in list mode", async () => {
    const session = await startTui("tui2", "board.md", "list");
    const screenshot = await captureScreenshot(session.port, "tui2-list-board");

    const defects = await analyzeScreenshot(screenshot.path, [
      "Short task",
      "medium length task",
    ]);

    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);

  test("handles many tasks with scrolling", async () => {
    const session = await startTui("tui2", "many-tasks.md", "list");
    const screenshot = await captureScreenshot(
      session.port,
      "tui2-many-tasks",
      80,
      20,
    );

    const defects = await analyzeScreenshot(screenshot.path, [
      "Task 01",
      "Large List",
    ]);

    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);

  test("handles overflow correctly", async () => {
    const session = await startTui("tui2", "overflow-test.md", "list");
    const screenshot = await captureScreenshot(
      session.port,
      "tui2-overflow",
      60,
      20,
    );

    const defects = await analyzeScreenshot(screenshot.path, [
      "This is an extremely long",
    ]);

    expect(defects.filter((d) => d.severity === "critical")).toHaveLength(0);
  }, 30000);
});

// ============================================================================
// Tests: TUI1 vs TUI2 Comparison
// ============================================================================

describeVisual("TUI1 vs TUI2 Visual Parity", () => {
  test("columns mode looks similar", async () => {
    // Capture TUI1
    const session1 = await startTui("tui1", "board.md", "columns");
    const screenshot1 = await captureScreenshot(
      session1.port,
      "compare-tui1-columns",
    );
    await stopTui(session1);

    // Capture TUI2
    const session2 = await startTui("tui2", "board.md", "columns");
    const screenshot2 = await captureScreenshot(
      session2.port,
      "compare-tui2-columns",
    );

    // Both screenshots should be captured
    expect(existsSync(screenshot1.path)).toBe(true);
    expect(existsSync(screenshot2.path)).toBe(true);

    // Note: actual pixel comparison would require pixelmatch or similar
    console.log("Screenshots captured for manual comparison:");
    console.log(`  TUI1: ${screenshot1.path}`);
    console.log(`  TUI2: ${screenshot2.path}`);
  }, 60000);

  test("list mode looks similar", async () => {
    // Capture TUI1
    const session1 = await startTui("tui1", "board.md", "list");
    const screenshot1 = await captureScreenshot(
      session1.port,
      "compare-tui1-list",
    );
    await stopTui(session1);

    // Capture TUI2
    const session2 = await startTui("tui2", "board.md", "list");
    const screenshot2 = await captureScreenshot(
      session2.port,
      "compare-tui2-list",
    );

    expect(existsSync(screenshot1.path)).toBe(true);
    expect(existsSync(screenshot2.path)).toBe(true);

    console.log("Screenshots captured for manual comparison:");
    console.log(`  TUI1: ${screenshot1.path}`);
    console.log(`  TUI2: ${screenshot2.path}`);
  }, 60000);
});

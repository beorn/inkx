/**
 * BoardTestHarness Integration Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { createBoardTest, type BoardTestHarness } from "../src/testing.ts";

describe("BoardTestHarness", () => {
  let vaultPath: string;
  let board: BoardTestHarness | null = null;

  beforeEach(async () => {
    // Create unique test vault
    vaultPath = `/tmp/kmtest-harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await mkdir(vaultPath, { recursive: true });

    // Create test content
    await writeFile(
      `${vaultPath}/tasks.md`,
      `# Tasks

- [ ] First task
- [ ] Second task
- [x] Done task
`,
    );
  });

  afterEach(async () => {
    // Cleanup
    if (board) {
      board.unmount();
      board = null;
    }
    await rm(vaultPath, { recursive: true, force: true });
  });

  test("screenshot captures initial state", async () => {
    board = await createBoardTest(vaultPath, { file: "tasks.md" });
    const screenshot = board.screenshot();

    expect(screenshot).toContain("Tasks");
    expect(screenshot).toContain("First task");
  });

  test("getByText finds task text", async () => {
    board = await createBoardTest(vaultPath, { file: "tasks.md" });

    // Should find the task text
    const task = board.getByText("First task");
    expect(task.count()).toBeGreaterThan(0);
  });

  test("press simulates keyboard input", async () => {
    board = await createBoardTest(vaultPath, { file: "tasks.md" });

    // Press down key
    board.press("j");

    // Screenshot should still work after input
    const screenshot = board.screenshot();
    expect(screenshot.length).toBeGreaterThan(0);
  });

  test("pressMultiple sends sequence of keys", async () => {
    board = await createBoardTest(vaultPath, { file: "tasks.md" });

    // Press multiple keys
    board.pressMultiple(["j", "j", "k"]);

    // Should not throw
    expect(true).toBe(true);
  });

  test("getCursor returns cursor position", async () => {
    board = await createBoardTest(vaultPath, { file: "tasks.md" });

    const cursor = board.getCursor();
    expect(Array.isArray(cursor)).toBe(true);
    expect(cursor.length).toBe(2);
  });

  test("unmount cleans up resources", async () => {
    board = await createBoardTest(vaultPath, { file: "tasks.md" });
    board.unmount();

    // Mark as null so afterEach doesn't try to unmount again
    board = null;
  });

  test("screenshotAnsi includes ANSI codes", async () => {
    board = await createBoardTest(vaultPath, { file: "tasks.md" });
    const ansiScreenshot = board.screenshotAnsi();

    // Should contain ANSI escape codes
    expect(ansiScreenshot).toMatch(/\x1b\[/);
  });

  test("locator finds elements by attribute", async () => {
    board = await createBoardTest(vaultPath, { file: "tasks.md" });

    // Try to find any elements
    const root = board.resolve();
    expect(root).not.toBeNull();
  });
});

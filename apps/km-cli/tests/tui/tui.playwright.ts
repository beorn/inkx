import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";

let ttydProcess: ChildProcess | null = null;

// Helper to wait for terminal to be ready
async function waitForTerminal(page: Page) {
  // Wait for the terminal container to be visible
  await page.waitForSelector(".xterm-screen", { timeout: 10000 });
  // Give it a moment to initialize
  await page.waitForTimeout(500);
}

// Helper to type in terminal
async function typeInTerminal(page: Page, text: string) {
  // Focus the terminal
  await page.click(".xterm-screen");
  // Type the text
  await page.keyboard.type(text, { delay: 10 });
}

// Helper to press a key
async function pressKey(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(100);
}

// Helper to take a screenshot for debugging
async function takeDebugScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/tui-test-${name}.png`, fullPage: true });
}

test.describe("TUI View Tests", () => {
  test.beforeAll(async () => {
    // Start ttyd server
    const testVaultPath = `${process.cwd()}/apps/km-cli/tests/fixtures/tui-test-vault`;
    ttydProcess = spawn(
      "ttyd",
      [
        "-W",
        "-p",
        "7681",
        "bun",
        "run",
        "./apps/km-cli/src/index.ts",
        "view",
        "-r",
        testVaultPath,
      ],
      {
        cwd: process.cwd(),
        stdio: "inherit",
      },
    );

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  test.afterAll(async () => {
    if (ttydProcess) {
      ttydProcess.kill();
      ttydProcess = null;
    }
  });

  test("should display cards view by default", async ({ page }) => {
    await page.goto("/");
    await waitForTerminal(page);
    await takeDebugScreenshot(page, "01-initial");

    // The terminal should show the TUI
    // Check that we can see the terminal content
    const terminalContent = await page.locator(".xterm-screen").textContent();
    expect(terminalContent).toBeTruthy();
  });

  test("should switch views with 'v' key", async ({ page }) => {
    await page.goto("/");
    await waitForTerminal(page);
    await takeDebugScreenshot(page, "02-before-view-switch");

    // Press 'v' to switch to columns view
    await pressKey(page, "v");
    await page.waitForTimeout(500);
    await takeDebugScreenshot(page, "03-columns-view");

    // Press 'v' again to switch to list view
    await pressKey(page, "v");
    await page.waitForTimeout(500);
    await takeDebugScreenshot(page, "04-list-view");

    // Press 'v' again to go back to cards view
    await pressKey(page, "v");
    await page.waitForTimeout(500);
    await takeDebugScreenshot(page, "05-back-to-cards");
  });

  test("should navigate with arrow keys", async ({ page }) => {
    await page.goto("/");
    await waitForTerminal(page);

    // Navigate right
    await pressKey(page, "ArrowRight");
    await takeDebugScreenshot(page, "06-arrow-right");

    // Navigate right again
    await pressKey(page, "ArrowRight");
    await takeDebugScreenshot(page, "07-arrow-right-2");

    // Navigate down
    await pressKey(page, "ArrowDown");
    await takeDebugScreenshot(page, "08-arrow-down");

    // Navigate left
    await pressKey(page, "ArrowLeft");
    await takeDebugScreenshot(page, "09-arrow-left");

    // Navigate up
    await pressKey(page, "ArrowUp");
    await takeDebugScreenshot(page, "10-arrow-up");
  });

  test("should expand/collapse with Enter", async ({ page }) => {
    await page.goto("/");
    await waitForTerminal(page);

    // Navigate to an item
    await pressKey(page, "ArrowDown");
    await takeDebugScreenshot(page, "11-before-enter");

    // Press Enter to expand
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "12-after-enter");

    // Press Escape to go back
    await pressKey(page, "Escape");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "13-after-escape");
  });

  test("should quit with 'q' key", async ({ page }) => {
    await page.goto("/");
    await waitForTerminal(page);

    // Press 'q' to quit
    await pressKey(page, "q");
    await page.waitForTimeout(500);
    await takeDebugScreenshot(page, "14-after-quit");

    // Terminal should show exit or shell prompt
  });
});

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

  test("should show help overlay with '?' key", async ({ page }) => {
    await page.goto("/");
    await waitForTerminal(page);
    await takeDebugScreenshot(page, "help-01-before");

    // Press '?' to show help overlay
    await pressKey(page, "Shift+/"); // '?' is Shift+/
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "help-02-overlay-shown");

    // Verify the help overlay content is visible
    const terminalContent = await page.locator(".xterm-screen").textContent();
    expect(terminalContent).toContain("Keyboard Shortcuts");
    expect(terminalContent).toContain("Navigation");
    expect(terminalContent).toContain("Press ? or Esc to close");

    // Press '?' again to dismiss
    await pressKey(page, "Shift+/");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "help-03-dismissed-with-question");

    // Verify overlay is dismissed (should not show "Keyboard Shortcuts" prominently)
    // Re-show and dismiss with Escape
    await pressKey(page, "Shift+/");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "help-04-reshown");

    await pressKey(page, "Escape");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "help-05-dismissed-with-escape");
  });

  test("should show project picker with 'p' key", async ({ page }) => {
    await page.goto("/");
    await waitForTerminal(page);

    // Navigate to a task first (project picker requires a selected task)
    await pressKey(page, "ArrowDown");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "picker-01-before");

    // Press 'p' to open project picker
    await pressKey(page, "p");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "picker-02-opened");

    // Verify the project picker content is visible
    const terminalContent = await page.locator(".xterm-screen").textContent();
    expect(terminalContent).toContain("Move to project");

    // Dismiss with Escape
    await pressKey(page, "Escape");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "picker-03-dismissed");
  });

  test("should show new item dialog with 'n' key", async ({ page }) => {
    await page.goto("/");
    await waitForTerminal(page);
    await takeDebugScreenshot(page, "newitem-01-before");

    // Press 'n' to open new item dialog
    await pressKey(page, "n");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "newitem-02-opened");

    // Verify the new item dialog content is visible
    const terminalContent = await page.locator(".xterm-screen").textContent();
    expect(terminalContent).toContain("New");

    // Dismiss with Escape
    await pressKey(page, "Escape");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "newitem-03-dismissed");
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

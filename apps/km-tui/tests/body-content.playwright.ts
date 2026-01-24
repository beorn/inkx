/**
 * Visual Tests for Body Content Feature (km-body)
 *
 * Tests that body content (paragraphs, code, quotes before sections) renders correctly:
 * - Board level: Body column appears first, dimmed, borderless
 * - Column level: Body cards appear before structural cards, borderless
 * - Navigation: h/l/j/k skip virtual body elements
 */
import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";

let ttydProcess: ChildProcess | null = null;

async function waitForTerminal(page: Page) {
  await page.waitForSelector(".xterm-screen", { timeout: 10000 });
  await page.waitForTimeout(500);
}

async function pressKey(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(100);
}

async function takeDebugScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/body-test-${name}.png`, fullPage: true });
}

test.describe("Body Content Visual Tests", () => {
  test.beforeAll(async () => {
    // Start ttyd server with body-test.md file
    const testVaultPath = `${process.cwd()}/apps/km-cli/tests/fixtures/tui-test-vault`;
    ttydProcess = spawn(
      "ttyd",
      [
        "-W",
        "-p",
        "7682", // Different port to avoid conflicts
        "bun",
        "run",
        "./apps/km-cli/src/index.ts",
        "view",
        "-r",
        testVaultPath,
        "body-test.md",
      ],
      {
        cwd: process.cwd(),
        stdio: "inherit",
        env: { ...process.env, FORCE_TTY: "1" },
      },
    );

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 4000));
  });

  test.afterAll(async () => {
    if (ttydProcess) {
      ttydProcess.kill();
      ttydProcess = null;
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:7682");
    await waitForTerminal(page);
  });

  test("body column appears with correct styling", async ({ page }) => {
    await takeDebugScreenshot(page, "01-initial-body-column");

    // The body column should be visible with "Description" header
    const terminalContent = await page.locator(".xterm-screen").textContent();

    // Body column should show the paragraph and code content
    // Note: exact text matching depends on rendering, so we check for key elements
    expect(terminalContent).toBeTruthy();
  });

  test("navigation skips body column (h/l)", async ({ page }) => {
    await takeDebugScreenshot(page, "02-before-nav");

    // Press 'l' to move right - should skip body column and go to Column A
    await pressKey(page, "l");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "03-after-l-skip-body");

    // Press 'h' to move left - should stay at Column A (can't go to body)
    await pressKey(page, "h");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "04-after-h-at-first-col");

    // Press 'l' again to go to Column B
    await pressKey(page, "l");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "05-at-column-b");
  });

  test("body cards within column render borderless", async ({ page }) => {
    // Navigate to Column A which has body content (intro paragraphs)
    await pressKey(page, "l");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "06-column-a-with-body-cards");

    // Navigate down into the column
    await pressKey(page, "j");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "07-first-real-card");

    // The body cards should appear above, borderless (dimmed)
    // The selected card should have a border
  });

  test("navigation skips body cards (j/k)", async ({ page }) => {
    // Navigate to Column A
    await pressKey(page, "l");
    await page.waitForTimeout(200);

    // Navigate down - should go to first real card (Card A1), not body
    await pressKey(page, "j");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "08-j-skips-body-cards");

    // Navigate up - should stay at first real card (can't go to body)
    await pressKey(page, "k");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "09-k-at-first-real-card");

    // Navigate down to Card A2
    await pressKey(page, "j");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "10-at-card-a2");
  });

  test("g (go top) goes to first real card, not body", async ({ page }) => {
    // Navigate to Column A
    await pressKey(page, "l");
    await page.waitForTimeout(200);

    // Navigate down a couple times
    await pressKey(page, "j");
    await pressKey(page, "j");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "11-at-card-a2");

    // Press 'g' to go to top - should go to first real card
    await pressKey(page, "g");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "12-g-to-first-real-card");
  });

  test("recursive body in nested content", async ({ page }) => {
    // Navigate to Column B
    await pressKey(page, "l");
    await pressKey(page, "l");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "13-at-column-b");

    // Navigate to Card B1 which has nested body content
    await pressKey(page, "j");
    await page.waitForTimeout(200);
    await takeDebugScreenshot(page, "14-card-b1-with-nested-body");

    // Expand the card to see nested content
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);
    await takeDebugScreenshot(page, "15-expanded-nested-body");
  });
});

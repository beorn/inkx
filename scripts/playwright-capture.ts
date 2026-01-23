#!/usr/bin/env bun
/**
 * Playwright Visual Capture Script
 *
 * Captures TUI screenshots via ttyd, waiting for actual content to render
 * before taking the screenshot. This solves the blank screen issue where
 * screenshots were captured before the TUI finished initializing.
 *
 * Usage:
 *   bun scripts/playwright-capture.ts <url> <output-path> [options]
 *
 * Options:
 *   --width <n>         Viewport width (default: 1000)
 *   --height <n>        Viewport height (default: 700)
 *   --wait-for <text>   Wait for specific text to appear (default: any non-empty content)
 *   --timeout <ms>      Max wait time in milliseconds (default: 10000)
 *   --headless          Run in headless mode (default: true if HEADLESS=true env var)
 *
 * Examples:
 *   # Wait for any content (default behavior)
 *   bun scripts/playwright-capture.ts http://localhost:7681 /tmp/tui.png
 *
 *   # Wait for specific text
 *   bun scripts/playwright-capture.ts http://localhost:7681 /tmp/tui.png --wait-for "CARDS VIEW"
 *
 *   # Custom viewport
 *   bun scripts/playwright-capture.ts http://localhost:7681 /tmp/tui.png --width 800 --height 600
 */

import { chromium } from "playwright";
import { parseArgs } from "node:util";

interface CaptureOptions {
  width: number;
  height: number;
  waitFor: string | null;
  timeout: number;
  headless: boolean;
}

async function captureScreenshot(
  url: string,
  outputPath: string,
  options: CaptureOptions,
): Promise<void> {
  const browser = await chromium.launch({ headless: options.headless });

  try {
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
    });

    const page = await context.newPage();

    console.error(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle" });

    // Keep connection open for TUI to initialize and render
    // The alternate screen buffer needs the WebSocket to stay connected
    console.error(`Waiting ${options.timeout}ms for TUI to render...`);
    await page.waitForTimeout(options.timeout);

    if (options.waitFor) {
      console.error(`Verifying text "${options.waitFor}" is present...`);
      const content = await page.textContent("body");
      if (!content?.includes(options.waitFor)) {
        throw new Error(`Expected text "${options.waitFor}" not found in terminal`);
      }
    }

    console.error("Ready to capture!");

    console.error(`Capturing screenshot to ${outputPath}...`);
    await page.screenshot({ path: outputPath });

    console.error("Screenshot captured successfully");
  } finally {
    await browser.close();
  }
}

// Parse command line arguments
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    width: { type: "string", default: "1000" },
    height: { type: "string", default: "700" },
    "wait-for": { type: "string" },
    timeout: { type: "string", default: "10000" },
    headless: { type: "boolean", default: process.env.HEADLESS === "true" },
  },
  allowPositionals: true,
});

if (positionals.length < 2) {
  console.error(
    "Usage: bun scripts/playwright-capture.ts <url> <output-path> [options]",
  );
  process.exit(1);
}

const [url, outputPath] = positionals;

const options: CaptureOptions = {
  width: parseInt(values.width || "1000", 10),
  height: parseInt(values.height || "700", 10),
  waitFor: values["wait-for"] ?? null,
  timeout: parseInt(values.timeout || "8000", 10), // 8s default for TUI initialization
  headless: values.headless ?? true,
};

captureScreenshot(url!, outputPath!, options).catch((error) => {
  console.error("Failed to capture screenshot:", error);
  process.exit(1);
});

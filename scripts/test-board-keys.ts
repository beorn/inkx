#!/usr/bin/env bun
/**
 * Test script for board TUI key handling
 *
 * Uses node-pty to create a pseudo-TTY and send keypresses
 */

import { spawn } from "node-pty";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/km-tui-test";

// Setup test environment
function setup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });

  // Create test markdown file with columns and cards
  writeFileSync(join(TEST_DIR, "test.md"), `# Column 1

## Card A
Content A

## Card B
Content B

## Card C
Content C

# Column 2

## Card D
Content D

## Card E
Content E
`);

  // Initialize km
  const initResult = Bun.spawnSync(["bun", "km", "--root", TEST_DIR, "init"], {
    cwd: process.cwd(),
  });
  console.log("Init:", initResult.stdout.toString());

  // Sync files
  const syncResult = Bun.spawnSync(["bun", "km", "--root", TEST_DIR, "sync"], {
    cwd: process.cwd(),
  });
  console.log("Sync:", syncResult.stdout.toString());
}

// Test key sequences
async function testKeys() {
  return new Promise<void>((resolve) => {
    console.log("\n=== Starting board TUI test ===\n");

    const pty = spawn("bun", ["km", "--root", TEST_DIR, "board"], {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: process.cwd(),
      env: { ...process.env, TERM: "xterm-256color" },
    });

    let output = "";

    pty.onData((data) => {
      output += data;
      process.stdout.write(data);
    });

    pty.onExit(({ exitCode }) => {
      console.log(`\n\n=== PTY exited with code ${exitCode} ===`);
      console.log("\n=== Full output ===");
      console.log(output);
      resolve();
    });

    // Send test keypresses with delays
    const keys: Array<{ key: string; delay: number; desc: string }> = [
      { key: "", delay: 500, desc: "Wait for startup" },
      { key: "j", delay: 200, desc: "Navigate down" },
      { key: "j", delay: 200, desc: "Navigate down again" },
      { key: "m", delay: 300, desc: "Enter move mode" },
      { key: "k", delay: 300, desc: "Move up (should move card)" },
      { key: "m", delay: 300, desc: "Enter move mode again" },
      { key: "j", delay: 300, desc: "Move down (should move card)" },
      { key: "q", delay: 200, desc: "Quit" },
    ];

    let i = 0;
    function sendNext() {
      if (i >= keys.length) {
        return;
      }

      const { key, delay, desc } = keys[i];
      i++;

      setTimeout(() => {
        if (key) {
          console.error(`\n>>> Sending key: "${key}" (${desc})`);
          pty.write(key);
        } else {
          console.error(`\n>>> ${desc}`);
        }
        sendNext();
      }, delay);
    }

    sendNext();
  });
}

// Cleanup
function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

// Main
async function main() {
  try {
    setup();
    await testKeys();
  } finally {
    cleanup();
  }
}

main().catch(console.error);

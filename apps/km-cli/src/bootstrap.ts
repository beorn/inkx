#!/usr/bin/env bun
/**
 * KM CLI Bootstrap
 *
 * Shows loading indicator immediately for view command,
 * then loads the main CLI module.
 */

// Show loading indicator BEFORE any heavy imports
const isViewCommand = process.argv[2] === "view" || process.argv[2] === "v";
if (isViewCommand && process.stdout.isTTY) {
  process.stdout.write("Loading...");
}

// Now load the main CLI (this triggers all the heavy imports)
import("./index.ts");

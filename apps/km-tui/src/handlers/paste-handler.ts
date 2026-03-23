/**
 * Paste and File Drop Handler
 *
 * Handles bracketed paste mode for detecting file drops in terminal.
 * Most terminals paste file paths as text when files are dropped.
 *
 * Note: This module intentionally uses fs directly (not km-storage) because
 * it checks arbitrary system paths from file drops, not store-relative paths.
 */

import { existsSync } from "fs"
import { homedir } from "os"
import { enableBracketedPaste, disableBracketedPaste, PASTE_START, PASTE_END } from "@silvery/ag-react"

// Increase max listeners for test scenarios where many Board components are created
// Each Board adds a paste handler that listens to stdin
process.stdin.setMaxListeners(200)

/**
 * Result of parsing pasted content
 */
interface PasteResult {
  type: "file" | "files" | "text"
  files?: string[]
  text?: string
}

/**
 * Check if a string looks like a file path
 */
function looksLikePath(str: string): boolean {
  const trimmed = str.trim()
  // Starts with / (absolute) or ~ (home) or ./ (relative)
  return trimmed.startsWith("/") || trimmed.startsWith("~") || trimmed.startsWith("./")
}

/**
 * Expand ~ to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return path.replace(/^~/, homedir())
  }
  return path
}

/**
 * Parse pasted content to detect file drops
 */
function parsePastedContent(content: string): PasteResult {
  // Remove bracketed paste sequences if present
  let text = content
  if (text.startsWith(PASTE_START)) {
    text = text.slice(PASTE_START.length)
  }
  if (text.endsWith(PASTE_END)) {
    text = text.slice(0, -PASTE_END.length)
  }

  // Trim whitespace
  text = text.trim()

  // Check for multiple paths (newline separated)
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l)

  // Check if all lines are valid file paths
  const validPaths: string[] = []
  for (const line of lines) {
    if (looksLikePath(line)) {
      const expanded = expandPath(line)
      try {
        if (existsSync(expanded)) {
          validPaths.push(expanded)
        }
      } catch {
        // Ignore errors checking path
      }
    }
  }

  // If we found valid paths, this is a file drop
  if (validPaths.length > 0) {
    if (validPaths.length === 1) {
      return { type: "file", files: validPaths }
    }
    return { type: "files", files: validPaths }
  }

  // Otherwise, it's regular text paste
  return { type: "text", text }
}

/**
 * Detect terminal type for terminal-specific handling
 */
function getTerminalType(): string {
  return process.env.TERM_PROGRAM || process.env.TERM || "unknown"
}

/**
 * Check if terminal supports file drop
 */
export function supportsFileDrop(): boolean {
  const term = getTerminalType().toLowerCase()
  // Known terminals that support file drop via paste
  const supported = ["ghostty", "iterm", "iterm.app", "kitty", "wezterm", "alacritty", "hyper"]
  return supported.some((t) => term.includes(t))
}

/**
 * Create a paste handler that processes raw stdin data
 * Returns a cleanup function
 */
export function createPasteHandler(
  onFileDrop: (files: string[]) => void,
  onTextPaste?: (text: string) => void,
): () => void {
  let pasteBuffer = ""
  let inPaste = false

  const handleData = (data: Buffer) => {
    const str = data.toString()

    // Check for paste start
    if (str.includes(PASTE_START)) {
      inPaste = true
      pasteBuffer = str.slice(str.indexOf(PASTE_START))
    } else if (inPaste) {
      pasteBuffer += str
    }

    // Check for paste end
    if (inPaste && pasteBuffer.includes(PASTE_END)) {
      inPaste = false
      const result = parsePastedContent(pasteBuffer)
      pasteBuffer = ""

      if (result.type === "file" || result.type === "files") {
        if (result.files) {
          onFileDrop(result.files)
        }
      } else if (result.type === "text" && onTextPaste && result.text) {
        onTextPaste(result.text)
      }
    }
  }

  // Enable bracketed paste
  enableBracketedPaste(process.stdout)

  // Listen for raw data if stdin is available in raw mode
  if (process.stdin.isTTY) {
    // Increase max listeners for test scenarios (tests create many Board components)
    if (process.stdin.getMaxListeners() < 50) {
      process.stdin.setMaxListeners(50)
    }
    process.stdin.on("data", handleData)
  }

  // Return cleanup function
  return () => {
    disableBracketedPaste(process.stdout)
    if (process.stdin.isTTY) {
      process.stdin.off("data", handleData)
    }
  }
}

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * Silvercode invariants enforced by tests rather than lint. These catch the
 * class of regressions we hit in the M0 dogfood: process.exit bypassing
 * silvery's TTY cleanup, and manual layout math (Math.floor/Math.max/…)
 * fighting the flex engine.
 *
 * The rules are scoped to silvercode's production code (src/ + packages/),
 * not tests — tests can call process.exit for harness scripts and use
 * arithmetic freely.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SRC_DIRS = [join(REPO_ROOT, "src"), join(REPO_ROOT, "packages")]

function walkTs(root: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(root, name)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === "tests") continue
      walkTs(full, out)
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(full)
    }
  }
  return out
}

describe("silvercode invariants", () => {
  test("no process.exit() in src/ or packages/src/ — use silvery's useExit()", () => {
    const offenders: string[] = []
    for (const dir of SRC_DIRS) {
      for (const file of walkTs(dir)) {
        if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue
        if (file.endsWith("/bin.ts") || file.endsWith("/bootstrap.ts")) continue
        const src = readFileSync(file, "utf8")
        // Strip lines with an explicit carve-out marker. Reserved for force-
        // exit in SIGINT / fatal-error paths where silvery has already run
        // its cleanup and we need to guarantee the host terminates even if
        // the event loop has lingering handles.
        const lines = src.split("\n").filter((l) => !l.includes("lint-ok: "))
        if (/\bprocess\.exit\s*\(/.test(lines.join("\n"))) {
          offenders.push(relative(REPO_ROOT, file))
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test("no Math.floor / Math.max on layout dimensions in components — use flexGrow / flexBasis", () => {
    const componentsDir = join(REPO_ROOT, "src/components")
    const offenders: Array<{ file: string; line: string }> = []
    for (const file of walkTs(componentsDir)) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue
      const src = readFileSync(file, "utf8")
      const lines = src.split("\n")
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        // Layout calcs = Math.* combined with a layout-ish identifier on the
        // same line. Narrow enough to ignore legitimate uses (e.g. Math.min
        // for maxLen in string truncation).
        // Narrow to the actually-dangerous pattern: arithmetic on terminal
        // dims (termRows/termCols) or card dims (cardHeight/cardWidth).
        // Legitimate Math.* uses on string lengths / indexes stay clean.
        if (
          /Math\.(floor|ceil|round|max|min)\b/.test(line) &&
          /\b(termRows|termCols|cardHeight|cardWidth)\b/.test(line)
        ) {
          offenders.push({ file: relative(REPO_ROOT, file), line: line.trim() })
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

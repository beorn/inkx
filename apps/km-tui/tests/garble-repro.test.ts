/**
 * Garble reproduction tests — uses real Asana vault to reproduce
 * the progressive garble when navigating the board.
 *
 * Bug: km-inkx.garble-incremental
 *
 * Run: TEST_VAULT=imports/asana bun vitest run apps/km-tui/tests/garble-repro.test.ts --testTimeout 120000
 */
import { describe, test, expect, afterEach } from "vitest"
import { createRepo, getChildren, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { outputPhase } from "../../../vendor/beorn-inkx/src/pipeline/output-phase.js"
import { createBoardDriver } from "../src/driver.ts"

afterEach(() => {
  delete process.env.INKX_STRICT
  delete process.env.INKX_STRICT_OUTPUT
  delete process.env.INKX_STRICT_ACCUMULATE
})

function findBoardRoot(repo: Repo): string {
  const nodes = repo.query("type:folder")
  for (const node of nodes) {
    if (node.title?.toLowerCase().includes("stabell")) return node.id
  }
  for (const node of nodes) {
    if (node.data?.is_repo_root) return node.id
  }
  for (const node of nodes) {
    const children = getChildren(repo.db, node.id)
    if (children.length >= 3) return node.id
  }
  throw new Error("No suitable board root found")
}

const NAV_SEQUENCE = [
  "l", // User's first garble trigger
  "j",
  "j", // Down
  "k", // Up
  "l", // Right again
  "j", // Into cards
  "k",
  "k", // Up to column level
  "h", // Left
  "j",
  "j",
  "j", // Down
  "l",
  "l", // Right
  "h",
  "h", // Left
  "k",
  "k",
  "k", // Up
  "j",
  "j", // Down
]

describe.skipIf(!process.env.TEST_VAULT)("garble reproduction", () => {
  test("Content phase: INKX_STRICT buffer mismatch", async () => {
    process.env.INKX_STRICT = "1"
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const driver = createBoardDriver(repo, rootId, {
      columns: 120,
      rows: 30,
      incremental: true,
    })

    for (let i = 0; i < NAV_SEQUENCE.length; i++) {
      try {
        await driver.press(NAV_SEQUENCE[i]!)
      } catch (e: any) {
        // Extract mismatch position from error message
        const match = e.message.match(/\((\d+),\s*(\d+)\)/)
        if (match) {
          const mx = parseInt(match[1])
          const my = parseInt(match[2])
          console.log(`\n=== MISMATCH at (${mx}, ${my}) on key #${i} '${NAV_SEQUENCE[i]}' ===`)

          // Set up write trap and re-run the key to capture what writes there
          const trap = { x: mx, y: my, log: [] as string[] }
          ;(globalThis as any).__inkx_write_trap = trap

          // Re-create the driver from the same point (run up to key i-1 without STRICT, then key i with trap)
          delete process.env.INKX_STRICT
          const repo2 = runGenerator(createRepo(vaultPath, { loadFiles: true }))
          const rootId2 = findBoardRoot(repo2)
          const driver2 = createBoardDriver(repo2, rootId2, {
            columns: 120,
            rows: 30,
            incremental: true,
          })
          for (let j = 0; j < i; j++) {
            await driver2.press(NAV_SEQUENCE[j]!)
          }

          // Now enable STRICT and the trap, then press the failing key
          process.env.INKX_STRICT = "1"
          try {
            await driver2.press(NAV_SEQUENCE[i]!)
          } catch (_) {
            // Expected to fail
          }

          console.log(`\n=== WRITE TRAP LOG (${trap.log.length} writes to (${mx}, ${my})) ===`)
          for (const entry of trap.log) {
            console.log(entry)
          }

          ;(globalThis as any).__inkx_write_trap = null
        }
        throw new Error(`Key #${i} '${NAV_SEQUENCE[i]}': ${e.message}`)
      }
    }
  }, 120_000)

  test("Output phase: accumulated ANSI vs fresh render", async () => {
    // No INKX_STRICT — test output phase only
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const driver = createBoardDriver(repo, rootId, {
      columns: 120,
      rows: 30,
      incremental: true,
    })

    // Get initial buffer and fresh ANSI output
    let prevBuffer = driver.lastBuffer()!
    let accumulated = outputPhase(null, prevBuffer, "fullscreen")

    for (let i = 0; i < NAV_SEQUENCE.length; i++) {
      await driver.press(NAV_SEQUENCE[i]!)

      const newBuffer = driver.lastBuffer()!
      const incrAnsi = outputPhase(prevBuffer, newBuffer, "fullscreen")
      accumulated += incrAnsi
      prevBuffer = newBuffer

      // Compare accumulated ANSI vs fresh render (characters)
      const freshAnsi = outputPhase(null, newBuffer, "fullscreen")
      const w = newBuffer.width
      const h = newBuffer.height
      const screenIncr = replayChars(w, h, accumulated)
      const screenFresh = replayChars(w, h, freshAnsi)

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (screenIncr[y]![x] !== screenFresh[y]![x]) {
            expect.fail(
              `Key #${i} '${NAV_SEQUENCE[i]}': char mismatch at (${x},${y})\n` +
                `  accumulated='${screenIncr[y]![x]}' fresh='${screenFresh[y]![x]}'`,
            )
          }
        }
      }

      // Compare styles (fg/bg) at each cell
      const styledIncr = replayStyles(w, h, accumulated)
      const styledFresh = replayStyles(w, h, freshAnsi)

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const si = styledIncr[y]![x]!
          const sf = styledFresh[y]![x]!
          if (si.fg !== sf.fg || si.bg !== sf.bg) {
            expect.fail(
              `Key #${i} '${NAV_SEQUENCE[i]}': STYLE mismatch at (${x},${y}) char='${si.char}'\n` +
                `  accumulated: fg=${si.fg} bg=${si.bg}\n` +
                `  fresh:       fg=${sf.fg} bg=${sf.bg}`,
            )
          }
        }
      }
    }
  }, 120_000)
})

// ==================== ANSI Replay Helpers ====================

function replayChars(w: number, h: number, ansi: string): string[][] {
  const screen: string[][] = Array.from({ length: h }, () => Array(w).fill(" "))
  let cx = 0,
    cy = 0,
    i = 0
  while (i < ansi.length) {
    if (ansi[i] === "\x1b") {
      if (ansi[i + 1] === "[") {
        i += 2
        let params = ""
        while (
          i < ansi.length &&
          ((ansi[i]! >= "0" && ansi[i]! <= "9") || ansi[i] === ";" || ansi[i] === "?" || ansi[i] === ":")
        ) {
          params += ansi[i]
          i++
        }
        const cmd = ansi[i]
        i++
        if (cmd === "H") {
          if (params === "") {
            cx = 0
            cy = 0
          } else {
            const p = params.split(";")
            cy = Math.max(0, (parseInt(p[0]!) || 1) - 1)
            cx = Math.max(0, (parseInt(p[1]!) || 1) - 1)
          }
        } else if (cmd === "K") {
          const n = parseInt(params) || 0
          if (n === 0) for (let x = cx; x < w; x++) screen[cy]![x] = " "
        } else if (cmd === "A") cy = Math.max(0, cy - (parseInt(params) || 1))
        else if (cmd === "B") cy = Math.min(h - 1, cy + (parseInt(params) || 1))
        else if (cmd === "C") cx = Math.min(w - 1, cx + (parseInt(params) || 1))
        else if (cmd === "D") cx = Math.max(0, cx - (parseInt(params) || 1))
        else if (cmd === "G") cx = Math.max(0, (parseInt(params) || 1) - 1)
        else if (cmd === "J") {
          if (params === "2") for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) screen[y]![x] = " "
        }
      } else if (ansi[i + 1] === "]") {
        i += 2
        while (i < ansi.length) {
          if (ansi[i] === "\x1b" && ansi[i + 1] === "\\") {
            i += 2
            break
          }
          if (ansi[i] === "\x07") {
            i++
            break
          }
          i++
        }
      } else i += 2
    } else if (ansi[i] === "\r") {
      cx = 0
      i++
    } else if (ansi[i] === "\n") {
      cy = Math.min(h - 1, cy + 1)
      i++
    } else {
      if (cy < h && cx < w) {
        screen[cy]![cx] = ansi[i]!
        cx++
      }
      i++
    }
  }
  return screen
}

interface CellStyle {
  char: string
  fg: string
  bg: string
}

function replayStyles(w: number, h: number, ansi: string): CellStyle[][] {
  const screen: CellStyle[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ char: " ", fg: "default", bg: "default" })),
  )
  let cx = 0,
    cy = 0,
    i = 0
  let fg = "default",
    bg = "default"

  while (i < ansi.length) {
    if (ansi[i] === "\x1b") {
      if (ansi[i + 1] === "[") {
        i += 2
        let params = ""
        while (
          i < ansi.length &&
          ((ansi[i]! >= "0" && ansi[i]! <= "9") || ansi[i] === ";" || ansi[i] === "?" || ansi[i] === ":")
        ) {
          params += ansi[i]
          i++
        }
        const cmd = ansi[i]
        i++
        if (cmd === "m") {
          // SGR — parse color codes
          const codes = params ? params.split(";").map(Number) : [0]
          let j = 0
          while (j < codes.length) {
            const c = codes[j]!
            if (c === 0) {
              fg = "default"
              bg = "default"
            } else if (c >= 30 && c <= 37) fg = `${c}`
            else if (c >= 40 && c <= 47) bg = `${c}`
            else if (c >= 90 && c <= 97) fg = `${c}`
            else if (c >= 100 && c <= 107) bg = `${c}`
            else if (c === 38 && codes[j + 1] === 5) {
              fg = `256:${codes[j + 2]}`
              j += 2
            } else if (c === 48 && codes[j + 1] === 5) {
              bg = `256:${codes[j + 2]}`
              j += 2
            } else if (c === 38 && codes[j + 1] === 2) {
              fg = `rgb:${codes[j + 2]},${codes[j + 3]},${codes[j + 4]}`
              j += 4
            } else if (c === 48 && codes[j + 1] === 2) {
              bg = `rgb:${codes[j + 2]},${codes[j + 3]},${codes[j + 4]}`
              j += 4
            } else if (c === 39) fg = "default"
            else if (c === 49) bg = "default"
            j++
          }
        } else if (cmd === "H") {
          if (params === "") {
            cx = 0
            cy = 0
          } else {
            const p = params.split(";")
            cy = Math.max(0, (parseInt(p[0]!) || 1) - 1)
            cx = Math.max(0, (parseInt(p[1]!) || 1) - 1)
          }
        } else if (cmd === "K") {
          const n = parseInt(params) || 0
          if (n === 0) {
            for (let x = cx; x < w; x++) {
              screen[cy]![x] = { char: " ", fg, bg }
            }
          }
        } else if (cmd === "A") cy = Math.max(0, cy - (parseInt(params) || 1))
        else if (cmd === "B") cy = Math.min(h - 1, cy + (parseInt(params) || 1))
        else if (cmd === "C") cx = Math.min(w - 1, cx + (parseInt(params) || 1))
        else if (cmd === "D") cx = Math.max(0, cx - (parseInt(params) || 1))
        else if (cmd === "G") cx = Math.max(0, (parseInt(params) || 1) - 1)
        else if (cmd === "J") {
          if (params === "2") {
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) screen[y]![x] = { char: " ", fg: "default", bg: "default" }
            }
          }
        }
      } else if (ansi[i + 1] === "]") {
        i += 2
        while (i < ansi.length) {
          if (ansi[i] === "\x1b" && ansi[i + 1] === "\\") {
            i += 2
            break
          }
          if (ansi[i] === "\x07") {
            i++
            break
          }
          i++
        }
      } else i += 2
    } else if (ansi[i] === "\r") {
      cx = 0
      i++
    } else if (ansi[i] === "\n") {
      cy = Math.min(h - 1, cy + 1)
      i++
    } else {
      if (cy < h && cx < w) {
        screen[cy]![cx] = { char: ansi[i]!, fg, bg }
        cx++
      }
      i++
    }
  }
  return screen
}

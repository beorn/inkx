/**
 * `truncate` per-line truncation hook for `wrap` truncate modes.
 *
 * The hook receives the overflowing line, the available CELL width, and a
 * cell-width-aware measurer (CJK / emoji = 2 cells). It returns the fitted line
 * or `null` to fall back to the built-in truncation. A hook result that still
 * overflows is defensively hard-clipped — the hook can never paint past the box
 * edge. This lets consumers (km's shell-command elision) supply a
 * width-dependent policy that static data props can't express, and stop
 * hand-rolling `.length`-vs-width math.
 *
 * Tracks bead @km/inbox/19788-km-f330.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { formatTextLines, truncateText } from "@silvery/ag-term/pipeline/render-text"
import { displayWidth } from "@silvery/ag-term"
import type { TextTruncateHook, TextMeasure } from "@silvery/ag"

const CMD = "git commit --message 'a very long commit message here' --no-verify"

const mid = (text: string, width: number, hook?: TextTruncateHook): string =>
  formatTextLines(text, width, "truncate-middle", undefined, true, hook)[0] ?? ""

/**
 * A representative km-style elision policy: keep the head, rescue the trailing
 * token whole when the tail budget (a width-dependent formula) allows it, glue
 * with " … ". Returns null when nothing useful fits, so the built-in path runs.
 */
function shellElision(line: string, width: number, m: TextMeasure): string | null {
  const sep = " … "
  const sepW = m.width(sep)
  const avail = width - sepW
  if (avail <= 0) return null
  // Width-dependent tail cap — the exact thing a data prop can't express.
  const tailCap = Math.min(Math.floor(avail / 3), 28)
  const lastSpace = line.lastIndexOf(" ")
  if (lastSpace <= 0) return null
  const tail = line.slice(lastSpace) // includes the leading space
  if (m.width(tail) > tailCap) return null
  const headBudget = avail - m.width(tail)
  const head = m.sliceByWidth(line, headBudget)
  return head + sep + tail
}

describe("truncate hook", () => {
  // (e) The no-hook path must be byte-identical to today. Pin verbatim before
  // and after — the hook code path must not perturb the built-in behavior.
  test("no-hook path is byte-identical to historical output", () => {
    expect(mid(CMD, 30)).toBe("git commit --m…re' --no-verify")
    expect(mid(CMD, 30, undefined)).toBe(mid(CMD, 30))
    expect(truncateText(CMD, 30, "middle")).toBe("git commit --m…re' --no-verify")
    // Other modes unchanged too.
    expect(truncateText(CMD, 20, "end")).toBe("git commit --messag…")
    expect(truncateText(CMD, 20, "start").endsWith("--no-verify")).toBe(true)
  })

  // (a) Hook receives CELL width and a measurer that reports CJK / emoji as 2
  // cells. Assert via a recording hook.
  test("hook receives cell width and a cell-width-aware measurer", () => {
    const seen: { width: number; cjk: number; emoji: number }[] = []
    const recorder: TextTruncateHook = (_line, width, m) => {
      seen.push({
        width,
        cjk: m.width("深圳"), // 2 CJK chars → 4 cells
        emoji: m.width("😀😁"), // 2 emoji → 4 cells
      })
      return null // fall back; we only care about the args
    }
    mid(CMD, 37, recorder)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.width).toBe(37) // the available CELL width, not code units
    expect(seen[0]!.cjk).toBe(4)
    expect(seen[0]!.emoji).toBe(4)
  })

  // (b) A hook result that fits is rendered verbatim.
  test("hook result is used verbatim when it fits", () => {
    const out = mid(CMD, 44, shellElision)
    expect(out).toContain(" … ")
    expect(out.endsWith(" --no-verify")).toBe(true) // trailing token rescued whole
    expect(displayWidth(out)).toBeLessThanOrEqual(44)
    // Verbatim: the hook's exact output, not re-truncated.
    const lastSpace = CMD.lastIndexOf(" ")
    const tail = CMD.slice(lastSpace)
    expect(out).toBe(CMD.slice(0, out.length - tail.length - 3) + " … " + tail)
  })

  // (c) An overwide hook result is hard-clipped, never rendered overwide (NO
  // silent trust).
  test("overwide hook result is clipped, not rendered overwide", () => {
    // A misbehaving hook that ignores the width and returns the whole line.
    const greedy: TextTruncateHook = (line) => line
    const out = mid(CMD, 20, greedy)
    expect(displayWidth(out)).toBeLessThanOrEqual(20)
    // It is the clipped prefix of the line (sliceByWidth), not the full line.
    expect(CMD.startsWith(out)).toBe(true)
    expect(out.length).toBeLessThan(CMD.length)
  })

  // (d) A hook returning null falls back to the built-in middle behavior,
  // byte-identically.
  test("hook returning null falls back to built-in middle behavior", () => {
    const alwaysNull: TextTruncateHook = () => null
    expect(mid(CMD, 30, alwaysNull)).toBe(mid(CMD, 30))
    expect(mid(CMD, 30, alwaysNull)).toBe("git commit --m…re' --no-verify")
  })

  // (f) The hook applies PER-LINE on multi-line text.
  test("hook applies per-line on multi-line input", () => {
    const lineA = "alpha-token alpha-tail-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa end-a"
    const lineB = "beta-token beta-tail-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb end-b"
    const text = `${lineA}\n${lineB}`
    const calls: string[] = []
    const recorder: TextTruncateHook = (line, width, m) => {
      calls.push(line)
      return shellElision(line, width, m)
    }
    const lines = formatTextLines(text, 40, "truncate-middle", undefined, true, recorder)
    expect(lines).toHaveLength(2)
    expect(calls).toEqual([lineA, lineB]) // invoked once per overflowing line
    expect(lines[0]!.endsWith(" end-a")).toBe(true)
    expect(lines[1]!.endsWith(" end-b")).toBe(true)
    expect(displayWidth(lines[0]!)).toBeLessThanOrEqual(40)
    expect(displayWidth(lines[1]!)).toBeLessThanOrEqual(40)
  })

  // (g) The hook is consulted for truncate-end mode too (not just middle).
  test("hook is consulted for truncate-end mode", () => {
    const calls: { line: string; width: number }[] = []
    const endHook: TextTruncateHook = (line, width, m) => {
      calls.push({ line, width })
      // A distinctive end-elision marker so we can prove the hook output is used.
      const marker = "»"
      const head = m.sliceByWidth(line, width - m.width(marker))
      return head + marker
    }
    const out = formatTextLines(CMD, 24, "truncate-end", undefined, true, endHook)[0]!
    expect(calls).toHaveLength(1)
    expect(calls[0]!.width).toBe(24)
    expect(out.endsWith("»")).toBe(true) // hook output used, not the built-in "…"
    expect(out).not.toContain("…")
    expect(displayWidth(out)).toBeLessThanOrEqual(24)
    // And the `wrap="truncate"` / `false` aliases route through the same path.
    const aliased = formatTextLines(CMD, 24, "truncate", undefined, true, endHook)[0]!
    expect(aliased.endsWith("»")).toBe(true)
  })

  // Wide-glyph safety: CJK and emoji lines, each glyph 2 cells. The hook output
  // (clipped if needed) must never exceed the box width.
  test("wide glyphs (CJK + emoji): result width never exceeds budget", () => {
    const cjk = "深圳市南山区科技园路一号" // 12 chars × 2 = 24 cells
    expect(displayWidth(cjk)).toBe(24)
    const emoji = "😀😁😂🤣😃😄😅😆" // 8 emoji × 2 = 16 cells
    expect(displayWidth(emoji)).toBe(16)

    for (const width of [10, 12, 14]) {
      const c = mid(cjk, width, shellElision) // no space → hook returns null → built-in
      expect(displayWidth(c)).toBeLessThanOrEqual(width)
      const e = mid(emoji, width, shellElision)
      expect(displayWidth(e)).toBeLessThanOrEqual(width)
    }
  })

  // Render-pipeline integration: the hook threads through the reconciler and
  // render phase, and a truncate-prop change re-renders (classified as a
  // text-content prop + the format cache is bypassed when a hook is present).
  test("renders through the pipeline and re-renders on truncate-hook change", () => {
    const WIDTH = 44
    function App({ hook }: { hook?: TextTruncateHook }) {
      return (
        <Box width={WIDTH} height={3}>
          <Text wrap="truncate-middle" truncate={hook}>
            {CMD}
          </Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: WIDTH, rows: 3 })
    const app = render(<App hook={shellElision} />)
    const first = app.text.split("\n")[0]!.trimEnd()
    expect(first).toContain(" … ")
    expect(first.endsWith(" --no-verify")).toBe(true)
    expect(displayWidth(first)).toBeLessThanOrEqual(WIDTH)

    // Swap to no hook → built-in middle truncation. The line must change.
    app.rerender(<App hook={undefined} />)
    const second = app.text.split("\n")[0]!.trimEnd()
    expect(second).not.toContain(" … ")
    expect(second).toContain("…")
    expect(displayWidth(second)).toBeLessThanOrEqual(WIDTH)
    expect(second).not.toBe(first)
  })

  // (1) ANSI contract: a Text with a color prop arrives at the hook as one
  // uniformly-styled SGR run. The hook must receive the PLAIN visible string
  // (no \x1b), and the rendered row must keep its styling with no literal
  // escape fragments leaking as text. Repro guard for 19746.
  test("color-prop Text: hook receives plain text, styling survives", () => {
    const WIDTH = 44
    const hookInputs: string[] = []
    const recordingElision: TextTruncateHook = (line, width, m) => {
      hookInputs.push(line)
      return shellElision(line, width, m)
    }
    function App() {
      return (
        <Box width={WIDTH} height={3}>
          <Text color="#8f95a1" wrap="truncate-middle" truncate={recordingElision}>
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 3 })
    const app = render(<App />)

    // The hook saw plain visible text — no escape bytes, no SGR fragments.
    expect(hookInputs.length).toBeGreaterThan(0)
    for (const input of hookInputs) {
      expect(input).not.toContain("\x1b")
      expect(input).not.toMatch(/\[38[;:]/) // no "38;2;..." SGR params
    }

    // The elision survives (the hook's marker), and no escape fragment leaked
    // into the visible text. app.text is the plain (ANSI-stripped) frame, so a
    // leak would show up as literal "[38" / ";2;" digits.
    const row = app.text.split("\n")[0]!
    expect(row).toContain(" … ")
    expect(row).not.toContain("[38")
    expect(row).not.toMatch(/\d;\s*\d;\s*\d{2,3}m/) // no "143 ; 149 ; 161m" garbage
    expect(displayWidth(row.trimEnd())).toBeLessThanOrEqual(WIDTH)

    // The styling is intact at the cell level: the first visible cell carries
    // the resolved color (0x8f=143, 0x95=149, 0xa1=161), proving prefix/suffix
    // re-attachment worked.
    expect(app.cell(0, 0).fg).toEqual({ r: 143, g: 149, b: 161 })
  })

  // (2) Multi-styled line (two different SGR runs) → NOT a single uniform run,
  // so the hook is NOT called; the built-in ANSI-aware truncation runs and no
  // literal escape fragment is rendered.
  test("multi-styled line: hook skipped, built-in ANSI-aware truncation used", () => {
    // Two distinct SGR runs glued together — peelUniformSgr must reject this.
    const red = "\x1b[31m"
    const green = "\x1b[32m"
    const reset = "\x1b[0m"
    const multi = `${red}alpha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa${reset}${green}beta-bbbbbbbbbbbbbbbbbbbbbbbb${reset}`
    let called = false
    const spyHook: TextTruncateHook = (line) => {
      called = true
      return line // would be wrong (overwide / mid-escape) if ever used
    }
    const out = truncateText(multi, 20, "middle", undefined, spyHook)
    expect(called).toBe(false) // hook skipped for multi-run ANSI
    // Built-in ANSI-aware path: visible width within budget, no leaked escape
    // FRAGMENT (a partial "[31" without the leading ESC) in the visible text.
    expect(displayWidth(out)).toBeLessThanOrEqual(20)
    const visible = out.replace(/\x1b\[[0-9;:]*m/g, "")
    expect(visible).not.toContain("[31")
    expect(visible).not.toContain("[32")
    expect(visible).toContain("…")
  })
})

/**
 * Autolink → OSC 8 hyperlink coverage.
 *
 * Pins the contract:
 *   1. A relative path in tool output (e.g. `apps/silvercode/src/parse.ts`)
 *      gets wrapped in an OSC 8 hyperlink with a cwd-resolved
 *      `file:///abs/...` href. This was the screenshot scenario that
 *      slipped through the original `<Link>` migration — `hrefFor` only
 *      handled absolute paths.
 *   2. Tilde paths (`~/Code/foo.ts`) get expanded against `$HOME`.
 *   3. Absolute paths pass through unchanged.
 *   4. Exactly one OSC 8 open + one close is emitted per detected path —
 *      proves the click target is unambiguous (no double-fire).
 *
 * `<LinkifiedText>` requires `<CwdProvider>` to resolve relative paths;
 * isolated harnesses with no provider get popover-only fallback (no OSC 8
 * emission). Tested at the bottom.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Prose } from "silvery"
import { LinkifiedText } from "../src/components/LinkifiedText.tsx"
import { CwdProvider } from "../src/CwdContext.tsx"

const OSC8_OPEN = /\x1b\]8;;([^\x07\x1b]+)(?:\x1b\\|\x07)/g

function Harness({ text, cwd }: { text: string; cwd?: string }): React.ReactElement {
  const tree = (
    <Box flexDirection="column" width={120}>
      <Prose flexShrink={1} minWidth={0}>
        <LinkifiedText text={text} />
      </Prose>
    </Box>
  )
  return cwd === undefined ? tree : <CwdProvider value={cwd}>{tree}</CwdProvider>
}

function osc8Hrefs(ansi: string): string[] {
  const out: string[] = []
  for (const m of ansi.matchAll(OSC8_OPEN)) {
    if (m[1] && m[1].length > 0) out.push(m[1]!)
  }
  return out
}

describe("LinkifiedText → OSC 8 hyperlinks", () => {
  test("relative path is resolved against cwd", () => {
    const render = createRenderer({ cols: 120, rows: 5 })
    const app = render(<Harness cwd="/abs/cwd" text="M apps/silvercode/src/parse.ts" />)
    const hrefs = osc8Hrefs(app.ansi)
    expect(hrefs).toEqual(["file:///abs/cwd/apps/silvercode/src/parse.ts"])
  })

  test("bare filename is resolved against cwd", () => {
    const render = createRenderer({ cols: 120, rows: 5 })
    const app = render(<Harness cwd="/abs/cwd" text="open screenshot.png" />)
    const hrefs = osc8Hrefs(app.ansi)
    expect(hrefs).toEqual(["file:///abs/cwd/screenshot.png"])
  })

  test("relative path with :line preserves the line target", () => {
    const render = createRenderer({ cols: 120, rows: 5 })
    const app = render(<Harness cwd="/abs/cwd" text="see apps/foo/bar.ts:42 for context" />)
    const hrefs = osc8Hrefs(app.ansi)
    expect(hrefs).toEqual(["file:///abs/cwd/apps/foo/bar.ts:42"])
  })

  test("absolute path passes through unchanged (cwd ignored)", () => {
    const render = createRenderer({ cols: 120, rows: 5 })
    const app = render(<Harness cwd="/abs/cwd" text="open /Users/beorn/Code/main.ts" />)
    const hrefs = osc8Hrefs(app.ansi)
    expect(hrefs).toEqual(["file:///Users/beorn/Code/main.ts"])
  })

  test("tilde path expands against $HOME", () => {
    const prevHome = process.env["HOME"]
    process.env["HOME"] = "/Users/test"
    try {
      const render = createRenderer({ cols: 120, rows: 5 })
      const app = render(<Harness cwd="/abs/cwd" text="~/Code/foo.ts" />)
      const hrefs = osc8Hrefs(app.ansi)
      expect(hrefs).toEqual(["file:///Users/test/Code/foo.ts"])
    } finally {
      if (prevHome !== undefined) process.env["HOME"] = prevHome
      else delete process.env["HOME"]
    }
  })

  test("exactly one OSC 8 hyperlink per detected path (no double-target)", () => {
    const render = createRenderer({ cols: 120, rows: 5 })
    const app = render(<Harness cwd="/abs/cwd" text="see apps/foo/a.ts and apps/bar/b.ts now" />)
    const hrefs = osc8Hrefs(app.ansi)
    expect(hrefs).toEqual(["file:///abs/cwd/apps/foo/a.ts", "file:///abs/cwd/apps/bar/b.ts"])
    // Ensure each open has a matching close (\x1b]8;;\x1b\\ or \x1b]8;;\x07).
    const opens = (app.ansi.match(/\x1b\]8;;[^\x07\x1b]+(?:\x1b\\|\x07)/g) ?? []).length
    const closes = (app.ansi.match(/\x1b\]8;;(?:\x1b\\|\x07)/g) ?? []).length
    expect(opens).toBe(2)
    expect(closes).toBe(2)
  })

  test("no cwd provider → relative paths fall back (no OSC 8 emitted)", () => {
    const render = createRenderer({ cols: 120, rows: 5 })
    const app = render(<Harness text="see apps/foo/bar.ts here" />)
    const hrefs = osc8Hrefs(app.ansi)
    expect(hrefs).toEqual([])
    // The path text is still rendered — popover-only fallback path.
    expect(app.text).toContain("apps/foo/bar.ts")
  })

  test("base64 data image renders as a compact image token", () => {
    const render = createRenderer({ cols: 120, rows: 5 })
    const app = render(<Harness text={`image data:image/png;base64,iVBORw0KGgo= done`} />)
    expect(app.text).toContain("[image data]")
    expect(app.text).not.toContain("iVBORw0KGgo=")
    expect(osc8Hrefs(app.ansi)).toEqual([])
  })

  test("muted in-app references are not visually special until armed", () => {
    const render = createRenderer({ cols: 120, rows: 5 })
    const app = render(<Harness cwd="/abs/cwd" text={`image data:image/png;base64,iVBORw0KGgo= and package.json`} />)

    const imageCol = app.lines[0]!.indexOf("[image data]")
    const fileCol = app.lines[0]!.indexOf("package.json")
    expect(imageCol).toBeGreaterThanOrEqual(0)
    expect(fileCol).toBeGreaterThanOrEqual(0)

    expect(app.cell(imageCol, 0).underline).toBe(false)
    expect(app.cell(fileCol, 0).underline).toBe(false)
  })
})

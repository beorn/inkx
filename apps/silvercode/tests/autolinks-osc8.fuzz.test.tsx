/**
 * Property fuzz: every relative path embedded in arbitrary surrounding
 * prose produces EXACTLY ONE OSC 8 hyperlink with the cwd-resolved
 * `file:///<cwd>/<path>` href. No double-targeting, no missed
 * detections, no scheme leak.
 *
 * Bead-style invariant: for every (prose, path, suffix) sample, the
 * rendered ANSI contains exactly one OSC 8 open whose URI ends with
 * `<path>` and exactly one matching close.
 *
 * The shape of failure this test catches:
 *   - regex regression that doubles a match (overlapping ranges)
 *   - absolute-path leak (wrong href base)
 *   - missing close ST (terminal would underline forever)
 *   - relative path resolution drift between prose contexts
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Prose } from "silvery"
import { LinkifiedText } from "../src/components/LinkifiedText.tsx"
import { CwdProvider } from "../src/CwdContext.tsx"

const OSC8_OPEN = /\x1b\]8;;([^\x07\x1b]+)(?:\x1b\\|\x07)/g
const OSC8_CLOSE = /\x1b\]8;;(?:\x1b\\|\x07)/g

const PROSE_PREFIXES = ["M ", "A ", "see ", "edit ", "open ", "look at ", "the file ", "path: ", "(modified) ", ""]

const PROSE_SUFFIXES = ["", " for context", " — needs review", " (was broken)", ", and the related", ".", " here."]

const PATHS = [
  "apps/silvercode/src/parse.ts",
  "vendor/silvery/packages/ag/src/types.ts",
  "src/main.tsx",
  "packages/foo/bar.json",
  "apps/km-tui/src/views/board.ts",
  "./relative/start/file.tsx",
  "../parent/sibling.md",
  "deeply/nested/path/with/many/segments/file.go",
]

const LINE_SUFFIXES = ["", ":42", ":42:7"]

const CWD = "/Users/beorn/Code/pim/km"

describe("LinkifiedText OSC 8 — fuzz", () => {
  test("every (prose, path, line-suffix) tuple emits exactly one OSC 8 hyperlink", () => {
    const failures: string[] = []
    const total: number[] = [0]
    // ONE renderer, reused across all permutations — createRenderer's
    // rerender fast-path keeps the instance live and avoids the
    // 1000-active-renders leak threshold that would otherwise trip on a
    // 1700-iteration sweep.
    const render = createRenderer({ cols: 200, rows: 5 })
    let app: ReturnType<typeof render> | null = null
    try {
      for (const prefix of PROSE_PREFIXES) {
        for (const path of PATHS) {
          for (const suffix of LINE_SUFFIXES) {
            for (const tail of PROSE_SUFFIXES) {
              total[0]!++
              const text = `${prefix}${path}${suffix}${tail}`
              app = render(
                <CwdProvider value={CWD}>
                  <Box flexDirection="column" width={200}>
                    <Prose flexShrink={1} minWidth={0}>
                      <LinkifiedText text={text} />
                    </Prose>
                  </Box>
                </CwdProvider>,
              )
              const opens = (app.ansi.match(OSC8_OPEN) ?? []).length
              const closes = (app.ansi.match(OSC8_CLOSE) ?? []).length
              // Extract href targets
              const hrefs: string[] = []
              for (const m of app.ansi.matchAll(OSC8_OPEN)) {
                if (m[1] && m[1].length > 0) hrefs.push(m[1]!)
              }
              // Resolve expected href: relative if no leading `/` or `~`,
              // else absolute. We reuse the same logic as the production
              // resolveAbsolute() — kept inline so the fuzz test pins the
              // contract independently.
              const resolved = path.startsWith("/")
                ? `file://${path}${suffix}`
                : path.startsWith("./") || path.startsWith("../")
                  ? `file://${CWD}/${path.replace(/^\.\/+/, "")}${suffix}`
                  : `file://${CWD}/${path}${suffix}`

              if (opens !== 1) failures.push(`opens=${opens} for "${text}"`)
              if (closes !== 1) failures.push(`closes=${closes} for "${text}"`)
              if (hrefs.length === 1 && hrefs[0] !== resolved) {
                failures.push(`href mismatch for "${text}": got ${hrefs[0]}, want ${resolved}`)
              }
            }
          }
        }
      }
    } finally {
      app?.unmount()
    }
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} failures of ${total[0]} samples:\n${failures.slice(0, 20).join("\n")}${
          failures.length > 20 ? `\n... +${failures.length - 20} more` : ""
        }`,
      )
    }
  }, 15_000)

  test("non-path prose emits zero OSC 8 hyperlinks", () => {
    const PROSE_NOT_PATHS = [
      "this is a plain sentence with no paths",
      "version 3.14 of the library",
      "running on port 8080 with timeout 30s",
      "the ratio is 4/3 in landscape mode",
      "between 2026-04-26 and 2026-05-01",
      "see foo.bar where bar isn't a known extension",
    ]
    const render = createRenderer({ cols: 200, rows: 5 })
    for (const text of PROSE_NOT_PATHS) {
      const app = render(
        <CwdProvider value={CWD}>
          <Box flexDirection="column" width={200}>
            <Prose flexShrink={1} minWidth={0}>
              <LinkifiedText text={text} />
            </Prose>
          </Box>
        </CwdProvider>,
      )
      const opens = (app.ansi.match(OSC8_OPEN) ?? []).length
      expect(opens, `expected 0 hyperlinks in "${text}", got ${opens}`).toBe(0)
    }
  })
})

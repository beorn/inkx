/**
 * Terminal-link projection for opaque Island cell grids.
 *
 * The guest remains the source of explicit OSC 8 links. Hosts may additionally
 * inject detected links, but only through an opt-in feature whose resolver owns
 * the capability boundary. Activation belongs between React mouse dispatch and
 * focused-Island routing: components may veto it, Cmd+click consumes the guest
 * mouse-up, plain clicks still reach the guest, and selection drag wins.
 */

import React, { useContext, useEffect } from "react"
import { describe, expect, test, vi } from "vitest"
import { Box, ChainAppContext, Island } from "@silvery/ag-react"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import type {
  IslandGuest,
  IslandHandle,
  IslandInputOwner,
  IslandModesOwner,
  IslandOutputOwner,
  IslandSizeOwner,
} from "@silvery/ag/island-types"
import { createTermless } from "@silvery/test"
import { run, withTerminalLinks } from "silvery/runtime"

type GuestCellLink = { start: number; end: number; href: string }

function textGuest(
  text: string,
  options: { links?: GuestCellLink[]; recordFeeds?: string[]; mouse?: boolean } = {},
): IslandGuest {
  return {
    capabilities: { input: options.recordFeeds !== undefined, modes: options.mouse === true },
    init(ctx) {
      const buffer = createCellBuffer(ctx.cols, ctx.rows)
      for (let col = 0; col < text.length && col < ctx.cols; col++) {
        const explicit = options.links?.find(({ start, end }) => col >= start && col < end)
        buffer.setCell(col, 0, {
          ...buffer.getCell(col, 0),
          char: text[col]!,
          ...(explicit ? { hyperlink: explicit.href } : {}),
        })
      }
      const size: IslandSizeOwner = {
        get cols() {
          return ctx.cols
        },
        get rows() {
          return ctx.rows
        },
        subscribe: () => () => {},
        requestResize: () => {},
      }
      const output: IslandOutputOwner = {
        buffer,
        cursor: null,
        cursorVisible: false,
        subscribe: () => () => {},
        writeCells: () => {},
        invalidateAll: () => {},
      }
      const input: IslandInputOwner | undefined = options.recordFeeds
        ? {
            feed(bytes) {
              options.recordFeeds!.push(new TextDecoder().decode(bytes))
            },
          }
        : undefined
      const modes: IslandModesOwner | undefined = options.mouse
        ? {
            get modes() {
              return { mouseTracking: "any" as const }
            },
            subscribe: () => () => {},
          }
        : undefined
      const handle: IslandHandle = {
        size,
        output,
        ...(input ? { input } : {}),
        ...(modes ? { modes } : {}),
        dispose: () => {},
      }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  }
}

function islandRect(root: import("@silvery/ag/types").AgNode): {
  x: number
  y: number
  width: number
  height: number
} {
  const pending = [root]
  while (pending.length > 0) {
    const node = pending.pop()!
    if (node.type === "silvery-island" && node.boxRect) return node.boxRect
    pending.push(...node.children)
  }
  throw new Error("expected rendered Island")
}

function useOpenedLinks(opened: string[], sequence?: string[]): React.ReactElement | null {
  const chain = useContext(ChainAppContext)
  useEffect(() => {
    return chain?.events.on("link:open", (href: unknown) => {
      if (typeof href === "string") {
        opened.push(href)
        sequence?.push(`open:${href}`)
      }
    })
  }, [chain, opened, sequence])
  return null
}

async function settle(ms = 50): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function sendKittyCmd(term: unknown, action: "press" | "release"): void {
  const sendInput = (term as { sendInput?: (input: string) => void }).sendInput
  if (!sendInput) throw new Error("Termless input injection unavailable")
  sendInput(action === "press" ? "\x1b[57444;9:1u" : "\x1b[57444;1:3u")
}

describe("withTerminalLinks", () => {
  test("is inert when absent: byte-identical text and no detector or hyperlink work", async () => {
    using term = createTermless({ cols: 40, rows: 4 })
    const detect = vi.fn(() => [{ start: 0, end: 20, href: "https://example.test" }])
    const guest = textGuest("https://example.test")

    const handle = await run(<Island guest={guest} cols={20} rows={1} />, term, {
      mouse: true,
    })
    try {
      await settle()
      const rect = islandRect(handle.root)
      expect(handle.text.slice(0, 20)).toBe("https://example.test")
      expect(handle.buffer?.getCell(rect.x, rect.y).hyperlink).toBeUndefined()
      expect(detect).not.toHaveBeenCalled()
    } finally {
      handle.unmount()
    }
  })

  test.each([
    {
      name: "a policy-rejected guest OSC 8 link",
      terminalLinks: withTerminalLinks({ resolveHref: () => null }),
    },
    {
      name: "a guest OSC 8 link with no injected policy",
      terminalLinks: withTerminalLinks(),
    },
  ])("strips $name before paint while preserving its text", async ({ terminalLinks }) => {
    using term = createTermless({ cols: 40, rows: 4 })
    const text = "VISIBLE"
    const guest = textGuest(text, {
      links: [{ start: 0, end: text.length, href: "shell://danger" }],
    })

    const handle = await run(<Island guest={guest} cols={text.length} rows={1} />, term, {
      terminalLinks,
    })
    try {
      await settle()
      const rect = islandRect(handle.root)
      expect(handle.text.slice(0, text.length)).toBe(text)
      expect(handle.buffer?.getCell(rect.x, rect.y).hyperlink).toBeUndefined()
      expect(term.out.getChunks().join("")).not.toContain("\x1b]8;")
    } finally {
      handle.unmount()
    }
  })

  test("preserves explicit links, projects detected links, and gates both through the resolver", async () => {
    using term = createTermless({ cols: 48, rows: 4 })
    const text = "EXPLICIT BLOCKED DETECTED"
    const explicitEnd = "EXPLICIT".length
    const blockedStart = text.indexOf("BLOCKED")
    const blockedEnd = blockedStart + "BLOCKED".length
    const detectedStart = text.indexOf("DETECTED")
    const guest = textGuest(text, {
      links: [
        { start: 0, end: explicitEnd, href: "https://explicit.test" },
        { start: blockedStart, end: blockedEnd, href: "shell://danger" },
      ],
    })
    const terminalLinks = withTerminalLinks({
      detect: () => [
        { start: 0, end: explicitEnd, href: "https://overlap.test" },
        { start: blockedStart, end: blockedEnd, href: "https://replacement.test" },
        { start: detectedStart, end: text.length, href: "https://detected.test" },
      ],
      resolveHref: (href) => (href.startsWith("https://") ? href : null),
    })

    const handle = await run(<Island guest={guest} cols={text.length} rows={1} />, term, {
      mouse: true,
      terminalLinks,
    })
    try {
      await settle()
      const rect = islandRect(handle.root)
      expect(handle.buffer?.getCell(rect.x, rect.y).hyperlink).toBe("https://explicit.test")
      expect(handle.buffer?.getCell(rect.x + blockedStart, rect.y).hyperlink).toBeUndefined()
      expect(handle.buffer?.getCell(rect.x + detectedStart, rect.y).hyperlink).toBe(
        "https://detected.test",
      )
    } finally {
      handle.unmount()
    }
  })

  test("orders component veto, Cmd activation, guest routing, and selection drag", async () => {
    using term = createTermless({ cols: 48, rows: 5 })
    const sequence: string[] = []
    const feeds: string[] = []
    const opened: string[] = []
    let veto = false
    const guest = textGuest("OPEN drag-target", {
      links: [{ start: 0, end: 4, href: "https://explicit.test" }],
      recordFeeds: feeds,
      mouse: true,
    })

    function OpenObserver(): React.ReactElement | null {
      return useOpenedLinks(opened, sequence)
    }

    function App(): React.ReactElement {
      return (
        <Box
          onClick={(event) => {
            sequence.push("component")
            if (veto) event.preventDefault()
          }}
        >
          <OpenObserver />
          <Island guest={guest} cols={16} rows={1} focusable />
        </Box>
      )
    }

    const terminalLinks = withTerminalLinks({
      resolveHref: (href) => (href.startsWith("https://") ? href : null),
    })
    const handle = await run(<App />, term, {
      kitty: true,
      mouse: true,
      selection: true,
      terminalLinks,
    })
    try {
      await settle()
      await handle.press("Tab")
      const rect = islandRect(handle.root)

      sendKittyCmd(term, "press")
      await term.mouse.click(rect.x, rect.y)
      sendKittyCmd(term, "release")
      await settle()

      expect(sequence).toEqual(["component", "open:https://explicit.test"])
      expect(opened).toEqual(["https://explicit.test"])
      expect(feeds).toContain("\x1b[<0;1;1M")
      expect(feeds).not.toContain("\x1b[<0;1;1m")

      sequence.length = 0
      feeds.length = 0
      await term.mouse.click(rect.x, rect.y)
      await settle()
      expect(sequence).toEqual(["component"])
      expect(opened).toEqual(["https://explicit.test"])
      expect(feeds).toEqual(["\x1b[<0;1;1M", "\x1b[<0;1;1m"])

      veto = true
      sequence.length = 0
      feeds.length = 0
      sendKittyCmd(term, "press")
      await term.mouse.click(rect.x, rect.y)
      sendKittyCmd(term, "release")
      await settle()
      expect(sequence).toEqual(["component"])
      expect(opened).toEqual(["https://explicit.test"])
      expect(feeds).toContain("\x1b[<0;1;1M")
      expect(feeds).not.toContain("\x1b[<0;1;1m")

      veto = false
      sequence.length = 0
      feeds.length = 0
      term.clipboard.clear()
      await term.mouse.drag({ from: [rect.x + 5, rect.y], to: [rect.x + 15, rect.y] })
      await settle()
      expect(opened).toEqual(["https://explicit.test"])
      expect(term.clipboard.last).toContain("drag-target")
    } finally {
      handle.unmount()
    }
  })
})

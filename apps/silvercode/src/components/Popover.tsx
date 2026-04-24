import React, { createContext, useCallback, useContext, useMemo, useState } from "react"
import { Box, Muted, Text } from "silvery"

/**
 * Popover primitive for silvercode — lifts the km-logview / km-tui pattern to
 * something that can be consumed from MessageList blocks. M9-grade content
 * (bead/file/URL/km-node) plugs in here via `content`.
 *
 * When silvery ships its own floating Popover (tracked in km-silvery.popover),
 * this becomes a thin adapter. Until then, silvercode keeps its own.
 */

type PopoverState = {
  content: React.ReactNode | null
  anchor: { x: number; y: number } | null
}

type Ctx = {
  show(content: React.ReactNode, anchor: { x: number; y: number }): void
  hide(): void
  state: PopoverState
}

const PopoverCtx = createContext<Ctx | null>(null)

export function PopoverProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<PopoverState>({ content: null, anchor: null })
  const ctx = useMemo<Ctx>(
    () => ({
      state,
      show: (content, anchor) => setState({ content, anchor }),
      hide: () => setState({ content: null, anchor: null }),
    }),
    [state],
  )
  return <PopoverCtx.Provider value={ctx}>{children}</PopoverCtx.Provider>
}

export function usePopover(): Ctx {
  const ctx = useContext(PopoverCtx)
  if (!ctx) throw new Error("usePopover must be used inside a PopoverProvider")
  return ctx
}

export function PopoverLayer(): React.ReactElement | null {
  const ctx = useContext(PopoverCtx)
  if (!ctx || !ctx.state.content) return null
  // Positioning is anchor-relative; silvery's absolute positioning puts this
  // beside the anchor. In scrollback mode we render inline below the content
  // that triggered the popover instead of floating — single path for M0.
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="$accent"
      backgroundColor="$surfacebg"
      padding={1}
      paddingX={2}
    >
      <Box flexDirection="row" gap={1}>
        <Text bold color="$accent">
          ⌽ popover
        </Text>
        <Box flexGrow={1} />
        <Muted>Esc to dismiss</Muted>
      </Box>
      <Box flexDirection="column" paddingLeft={2}>
        {ctx.state.content}
      </Box>
    </Box>
  )
}

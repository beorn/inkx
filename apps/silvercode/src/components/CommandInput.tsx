import React, { useRef } from "react"
import { Box, TextInput } from "silvery"

/**
 * Command input bar. Ctrl+D with an empty buffer arms "exit"; a second
 * Ctrl+D within 1.5s invokes the parent-provided onExit. The parent is
 * responsible for closing all sessions AND calling silvery's useExit — both
 * are required. Without session close, child claude subprocesses survive
 * the alt-screen restore and keep the host process hanging.
 */
export function CommandInput({
  value,
  onChange,
  disabled,
  onSubmit,
  onExit,
  promptColor = "$primary",
}: {
  value: string
  onChange: (text: string) => void
  disabled?: boolean
  onSubmit: (text: string) => void
  onExit: () => void
  /**
   * Color of the `>` prompt glyph. Defaults to `$primary` but the host app
   * passes the current permission-mode color so the prompt reflects what
   * Claude is allowed to do (plan=$info, accept-edits=$warning, auto=
   * $success, bypass=$error). Rendered bold.
   */
  promptColor?: string
}): React.ReactElement {
  const armedAt = useRef<number>(0)

  return (
    <Box flexGrow={1} flexDirection="row">
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={(v) => {
          if (!v.trim()) return
          onSubmit(v)
        }}
        onEOF={() => {
          const now = Date.now()
          if (armedAt.current > 0 && now - armedAt.current < 1500) {
            onExit()
            return
          }
          armedAt.current = now
        }}
        isActive={!disabled}
        prompt="> "
        promptColor={promptColor}
        promptBold
        placeholder={disabled ? "spawning…" : ""}
      />
    </Box>
  )
}

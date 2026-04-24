import React, { useRef } from "react"
import { Box, TextInput, useExit } from "silvery"

/**
 * Command input bar. Ctrl+D with an empty buffer arms "exit"; a second
 * Ctrl+D within 1.5s exits the app cleanly via silvery's useExit hook (so
 * alt-screen, raw mode, mouse tracking, and bracketed-paste are all
 * restored — never call process.exit from inside a silvery app).
 */
export function CommandInput({
  value,
  onChange,
  disabled,
  onSubmit,
}: {
  value: string
  onChange: (text: string) => void
  disabled?: boolean
  onSubmit: (text: string) => void
}): React.ReactElement {
  const armedAt = useRef<number>(0)
  const exit = useExit()

  return (
    <Box borderStyle="single" borderColor="$border" paddingX={1}>
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
            exit()
            return
          }
          armedAt.current = now
        }}
        isActive={!disabled}
        prompt="> "
        promptColor="$primary"
        placeholder={disabled ? "spawning…" : ""}
      />
    </Box>
  )
}

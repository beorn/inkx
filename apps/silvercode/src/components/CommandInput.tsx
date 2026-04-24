import React, { useRef } from "react"
import { Box, TextInput } from "silvery"

/**
 * Command input bar. Ctrl+D with an empty buffer arms "exit"; a second
 * Ctrl+D within 1.5s exits the app. Single Ctrl+D alone is a no-op so it
 * doesn't close the app on an accidental press.
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
            process.exit(0)
          }
          armedAt.current = now
          // Flash a placeholder; TextInput shows it whenever value is empty.
        }}
        isActive={!disabled}
        prompt="> "
        promptColor="$primary"
        placeholder={disabled ? "spawning…" : "Type a message or / for commands. Enter to send. Ctrl+D twice to exit."}
      />
    </Box>
  )
}

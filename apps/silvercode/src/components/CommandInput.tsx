import React from "react"
import { Box, TextInput } from "silvery"

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
  return (
    <Box borderStyle="single" borderColor="$border" paddingX={1}>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={(v) => {
          if (!v.trim()) return
          onSubmit(v)
        }}
        isActive={!disabled}
        prompt="> "
        promptColor="$primary"
        placeholder={disabled ? "spawning…" : "Type a message or / for commands. Enter to send."}
      />
    </Box>
  )
}

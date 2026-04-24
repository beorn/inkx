import React, { useMemo, useState } from "react"
import { Box, ModalDialog, Muted, SelectList, Text } from "silvery"
import { useInput } from "silvery/runtime"
import type { SessionHandle } from "../controller.ts"

type Entry = {
  sessionId: string
  sessionName: string
  requestId: string
  tool: string
  args: unknown
}

export function PermissionInbox({
  sessions,
  onApprove,
  onDeny,
  onClose,
}: {
  sessions: SessionHandle[]
  onApprove: (sessionId: string, requestId: string) => void
  onDeny: (sessionId: string, requestId: string) => void
  onClose: () => void
}): React.ReactElement {
  const entries: Entry[] = useMemo(() => {
    const list: Entry[] = []
    for (const s of sessions) {
      const state = s.store.state.get()
      for (const p of state.permissions) {
        list.push({
          sessionId: s.id,
          sessionName: s.name,
          requestId: p.requestId,
          tool: p.tool,
          args: p.args,
        })
      }
    }
    return list
  }, [sessions])

  const [cursor, setCursor] = useState(0)
  const current = entries[cursor]

  useInput(
    (input, key) => {
      if (key.escape) return onClose()
      if (!current) return
      if (input === "y") {
        onApprove(current.sessionId, current.requestId)
        setCursor((c) => Math.min(c, Math.max(0, entries.length - 2)))
      }
      if (input === "n") {
        onDeny(current.sessionId, current.requestId)
        setCursor((c) => Math.min(c, Math.max(0, entries.length - 2)))
      }
    },
    { isActive: true },
  )

  return (
    <ModalDialog title="Permission inbox" hotkey="Esc" onClose={onClose}>
      {entries.length === 0 ? (
        <Muted>No pending permission requests.</Muted>
      ) : (
        <Box flexDirection="column" gap={1}>
          <SelectList
            items={entries.map((e, i) => ({
              label: `${e.sessionName}  ${e.tool}`,
              value: String(i),
            }))}
            isActive
            highlightedIndex={cursor}
            onHighlight={setCursor}
            onSelect={(opt) => {
              const e = entries[Number(opt.value)]
              if (e) onApprove(e.sessionId, e.requestId)
            }}
          />
          {current && (
            <Box flexDirection="column" borderStyle="single" borderColor="$border" padding={1}>
              <Text bold>
                {current.sessionName} · {current.tool}
              </Text>
              <Text>{JSON.stringify(current.args, null, 2)}</Text>
              <Muted>y = approve · n = deny · Esc = close</Muted>
            </Box>
          )}
        </Box>
      )}
    </ModalDialog>
  )
}

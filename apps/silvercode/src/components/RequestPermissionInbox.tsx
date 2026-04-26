/**
 * RequestPermissionInbox — aggregates pending permission requests across
 * sessions and surfaces them for user approval or denial.
 *
 * For ACP sessions, each request carries an `options` array with named
 * permission variants (allow_once / allow_always / reject_once / reject_always).
 * When the agent provides multiple options the inbox renders all of them so
 * the user can choose the exact semantics they want — not just binary yes/no.
 *
 * For legacy (stream-json / Claude Code) sessions the single-option
 * allow/deny flow is preserved unchanged.
 *
 * Renamed from PermissionInbox (bead km-silvercode.acp-usage-and-permission).
 */
import React, { useMemo, useState } from "react"
import { Box, ModalDialog, Muted, SelectList, Text } from "silvery"
import { useInput } from "silvery/runtime"
import type { PermissionOptionId } from "@km/agent-harness"
import type { SessionHandle } from "../controller.ts"

type PermissionOption = {
  optionId: PermissionOptionId
  name: string
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always"
}

type Entry = {
  sessionId: string
  sessionName: string
  requestId: string
  tool: string
  args: unknown
  /** ACP-style options when the agent supplies them. Empty = legacy binary flow. */
  options: PermissionOption[]
}

export function RequestPermissionInbox({
  sessions,
  onApprove,
  onDeny,
  onClose,
  onSelectOption,
}: {
  sessions: SessionHandle[]
  onApprove: (sessionId: string, requestId: string) => void
  onDeny: (sessionId: string, requestId: string) => void
  onClose: () => void
  /**
   * Optional callback for multi-option ACP permission responses. When
   * provided, ACP sessions route through this instead of onApprove/onDeny.
   * `optionId` is one of the ACP option ids the agent supplied; `approved`
   * reflects whether it's an allow or reject option kind.
   */
  onSelectOption?: (sessionId: string, requestId: string, optionId: PermissionOptionId, approved: boolean) => void
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
          options: (p as unknown as { options?: PermissionOption[] }).options ?? [],
        })
      }
    }
    return list
  }, [sessions])

  const [cursor, setCursor] = useState(0)
  const [optionCursor, setOptionCursor] = useState(0)
  const current = entries[cursor]

  // When multi-option, default focus to the first allow_once option (if any).
  const optionItems = useMemo(() => {
    if (!current?.options.length) return []
    return current.options.map((o, i) => ({
      label: o.name,
      value: String(i),
      kind: o.kind,
    }))
  }, [current])

  const isMultiOption = optionItems.length > 0

  useInput(
    (input, key) => {
      if (key.escape) return onClose()
      if (!current) return

      if (isMultiOption) {
        // Enter / y on focused option → dispatch via onSelectOption or fallback.
        if (key.return || input === "y" || input === "n") {
          const opt = current.options[optionCursor]
          if (!opt) return
          const approved = opt.kind === "allow_once" || opt.kind === "allow_always"
          if (onSelectOption) {
            onSelectOption(current.sessionId, current.requestId, opt.optionId, approved)
          } else if (approved) {
            onApprove(current.sessionId, current.requestId)
          } else {
            onDeny(current.sessionId, current.requestId)
          }
          setCursor((c) => Math.min(c, Math.max(0, entries.length - 2)))
        }
      } else {
        // Legacy binary flow.
        if (input === "y") {
          onApprove(current.sessionId, current.requestId)
          setCursor((c) => Math.min(c, Math.max(0, entries.length - 2)))
        }
        if (input === "n") {
          onDeny(current.sessionId, current.requestId)
          setCursor((c) => Math.min(c, Math.max(0, entries.length - 2)))
        }
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
            isActive={!isMultiOption}
            highlightedIndex={cursor}
            onHighlight={(i) => {
              setCursor(i)
              setOptionCursor(0)
            }}
            onSelect={(opt) => {
              const e = entries[Number(opt.value)]
              if (e && !e.options.length) onApprove(e.sessionId, e.requestId)
            }}
          />
          {current && (
            <Box flexDirection="column" borderStyle="single" borderColor="$border" padding={1} gap={1}>
              <Text bold>
                {current.sessionName} · {current.tool}
              </Text>
              <Text>{JSON.stringify(current.args, null, 2)}</Text>
              {isMultiOption ? (
                <Box flexDirection="column" gap={0}>
                  <Muted>Choose an option:</Muted>
                  <SelectList
                    items={optionItems}
                    isActive
                    highlightedIndex={optionCursor}
                    onHighlight={setOptionCursor}
                    onSelect={(opt) => {
                      const idx = Number(opt.value)
                      const o = current.options[idx]
                      if (!o) return
                      const approved = o.kind === "allow_once" || o.kind === "allow_always"
                      if (onSelectOption) {
                        onSelectOption(current.sessionId, current.requestId, o.optionId, approved)
                      } else if (approved) {
                        onApprove(current.sessionId, current.requestId)
                      } else {
                        onDeny(current.sessionId, current.requestId)
                      }
                      setCursor((c) => Math.min(c, Math.max(0, entries.length - 2)))
                    }}
                  />
                  <Muted>Enter = select · Esc = close</Muted>
                </Box>
              ) : (
                <Muted>y = approve · n = deny · Esc = close</Muted>
              )}
            </Box>
          )}
        </Box>
      )}
    </ModalDialog>
  )
}

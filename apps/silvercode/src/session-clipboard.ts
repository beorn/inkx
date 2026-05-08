import { createOsc52Backend } from "silvery"
import { createChatSessionProjectionStore } from "./chat/store.ts"
import type { ChatBlock, ChatEvent, ChatMessage, ChatSession, ChatTool } from "./chat/types.ts"
import type { SessionHandle } from "./controller.ts"

type Writable = Pick<NodeJS.WriteStream, "write">

type ClipboardWriter = (stdout: Writable, text: string) => void

let writerOverride: ClipboardWriter | null = null

export function setSessionClipboardWriterOverride(writer: ClipboardWriter | null): void {
  writerOverride = writer
}

function writeClipboard(stdout: Writable, text: string): void {
  if (writerOverride) {
    writerOverride(stdout, text)
    return
  }
  void createOsc52Backend(stdout).write({ text })
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function formatAttachment(block: Extract<ChatBlock, { type: "attachment" }>): string {
  const { attachment } = block
  const attrs = [
    `kind=${attachment.kind}`,
    `label=${JSON.stringify(attachment.label)}`,
    attachment.uri ? `uri=${JSON.stringify(attachment.uri)}` : null,
    attachment.mimeType ? `mime=${JSON.stringify(attachment.mimeType)}` : null,
  ].filter((attr): attr is string => attr !== null)
  return `<attachment ${attrs.join(" ")} />`
}

function formatTool(tool: ChatTool): string {
  const chunks = [`<tool ${tool.name} id=${tool.id}>\n${formatUnknown(tool.input)}\n</tool>`]
  if (tool.status !== "running" || tool.output !== undefined) {
    chunks.push(
      `<tool_result id=${tool.id}${tool.status === "failed" ? " error=true" : ""}>\n${formatUnknown(tool.output)}\n</tool_result>`,
    )
  }
  return chunks.join("\n")
}

function formatBlock(block: ChatBlock, session: ChatSession): string {
  switch (block.type) {
    case "text":
      return block.text
    case "thought":
      return `<thinking>\n${block.text}\n</thinking>`
    case "attachment":
      return formatAttachment(block)
    case "tool-ref": {
      const tool = session.tools[block.toolId]
      return tool ? formatTool(tool) : `<tool_ref id=${block.toolId} />`
    }
  }
}

function eventOrder(session: ChatSession): Map<ChatEvent["id"], number> {
  return new Map(session.events.map((event, index) => [event.id, index]))
}

function firstEventOrder(ids: readonly ChatEvent["id"][], order: ReadonlyMap<ChatEvent["id"], number>): number {
  let first = Number.MAX_SAFE_INTEGER
  for (const id of ids) first = Math.min(first, order.get(id) ?? Number.MAX_SAFE_INTEGER)
  return first
}

function transcriptMessages(session: ChatSession): ChatMessage[] {
  const order = eventOrder(session)
  return Object.values(session.messages).sort(
    (a, b) =>
      firstEventOrder(a.eventIds, order) - firstEventOrder(b.eventIds, order) ||
      String(a.id).localeCompare(String(b.id)),
  )
}

function transcriptStandaloneTools(session: ChatSession, inlineToolIds: ReadonlySet<string>): ChatTool[] {
  const order = eventOrder(session)
  return Object.values(session.tools)
    .filter((tool) => !inlineToolIds.has(String(tool.id)))
    .sort(
      (a, b) =>
        firstEventOrder(a.eventIds, order) - firstEventOrder(b.eventIds, order) ||
        String(a.id).localeCompare(String(b.id)),
    )
}

function formatMessage(message: ChatMessage, session: ChatSession, inlineToolIds: Set<string>): string {
  const body = message.blockIds
    .map((id) => session.blocks[id])
    .filter((block): block is ChatBlock => block !== undefined)
    .map((block) => {
      if (block.type === "tool-ref") inlineToolIds.add(String(block.toolId))
      return formatBlock(block, session)
    })
    .filter((part) => part.length > 0)
    .join("\n")
  return `## ${message.role}\n${body}`.trimEnd()
}

function readProjectedSession(handle: SessionHandle): ChatSession {
  const projection = createChatSessionProjectionStore(handle.store, { sessionId: handle.id })
  try {
    return projection.session()
  } finally {
    projection.dispose()
  }
}

export function serializeSessionTranscript(
  handle: SessionHandle,
  session: ChatSession = readProjectedSession(handle),
): string {
  const state = handle.store.state.get()
  const inlineToolIds = new Set<string>()
  const messages = transcriptMessages(session).map((message) => formatMessage(message, session, inlineToolIds))
  const tools = transcriptStandaloneTools(session, inlineToolIds).map((tool) => `## tool\n${formatTool(tool)}`)
  const lines = [
    `# Session ${handle.session.sessionId}`,
    (session.model ?? state.model) ? `Model: ${session.model ?? state.model}` : null,
    (session.cwd ?? state.cwd) ? `CWD: ${session.cwd ?? state.cwd}` : null,
    `Status: ${session.status ?? state.status}`,
    "",
    ...messages,
    ...tools,
  ].filter((line): line is string => line !== null)
  return lines.join("\n\n").trimEnd() + "\n"
}

export function copySessionTranscriptToClipboard(handle: SessionHandle, stdout: Writable): void {
  writeClipboard(stdout, serializeSessionTranscript(handle))
}

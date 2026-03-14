/** Tool call in a message (Read, Edit, Bash, etc.). */
export interface ToolCall {
  tool: string
  args: string
  output: string[]
}

/** A single message in the conversation. */
export interface Message {
  id: number
  role: "user" | "agent" | "system"
  content: string
  thinking?: string
  toolCalls?: ToolCall[]
  tokens?: { input: number; output: number }
}

/** Script entry — message data before id is assigned. */
export type ScriptEntry = Omit<Message, "id">

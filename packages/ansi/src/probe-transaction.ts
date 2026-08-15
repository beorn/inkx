/** Exact half-open UTF-16 code-unit span consumed by a terminal probe recognizer. */
export interface ProbeTransactionSpan {
  readonly start: number
  readonly end: number
}

/** Incremental recognition state for one bounded terminal probe transaction. */
export type ProbeTransactionRecognition<T> =
  | {
      readonly status: "pending"
      readonly consumed: readonly ProbeTransactionSpan[]
    }
  | {
      readonly status: "complete"
      readonly consumed: readonly ProbeTransactionSpan[]
      readonly value: T
    }

/** Options shared by terminal owners and dependency-free structural adapters. */
export interface ProbeTransactionOptions<T> {
  readonly query: string
  readonly recognize: (acc: string) => ProbeTransactionRecognition<T>
  readonly timeoutMs: number
  readonly maxBufferBytes: number
}

/** Loud terminal-transaction outcome; absence is never collapsed into false. */
export type ProbeTransactionResult<T> =
  | { readonly status: "complete"; readonly value: T }
  | { readonly status: "timeout" }
  | { readonly status: "busy" }
  | {
      readonly status: "overflow"
      readonly maxBufferBytes: number
      readonly receivedBytes: number
    }
  | {
      readonly status: "error"
      readonly reason:
        | "disposed"
        | "invalid-options"
        | "invalid-consumed-span"
        | "recognizer-threw"
        | "write-failed"
      readonly message?: string
    }

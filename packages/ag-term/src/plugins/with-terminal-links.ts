import type { TerminalLinksOptions } from "../terminal-links"

interface RunnableApp {
  run(...args: unknown[]): unknown
  [key: string]: unknown
}

export interface AppWithTerminalLinks {
  readonly terminalLinks: TerminalLinksOptions
}

/**
 * Produce `link:open` events from visible terminal cells.
 *
 * The runtime applies the option after selection and component dispatch, so
 * drag and preventDefault() retain first refusal. Apps continue consuming the
 * existing shared event rail; this plugin performs no opening side effects.
 */
export function withTerminalLinks(
  options: TerminalLinksOptions = {},
): <T extends RunnableApp>(app: T) => T & AppWithTerminalLinks {
  return <T extends RunnableApp>(app: T): T & AppWithTerminalLinks => {
    const originalRun = app.run
    return Object.assign(Object.create(app), {
      terminalLinks: options,
      run(...args: unknown[]) {
        let existingOptions: Record<string, unknown> | undefined
        const last = args.at(-1)
        if (typeof last === "object" && last !== null && !("type" in last && "props" in last)) {
          existingOptions = last as Record<string, unknown>
        }

        const runOptions = { ...existingOptions, terminalLinks: options }
        if (existingOptions) {
          const nextArgs = [...args]
          nextArgs[nextArgs.length - 1] = runOptions
          return originalRun.apply(app, nextArgs)
        }
        return originalRun.call(app, ...args, runOptions)
      },
    }) as T & AppWithTerminalLinks
  }
}

export type {
  TerminalLinkDetector,
  TerminalLinkSpan,
  TerminalLinksOptions,
} from "../terminal-links"

/** User-facing CLI error — displayed cleanly without stack traces */
export class CliError extends Error {
  hint?: string

  constructor(message: string, hint?: string) {
    super(message)
    this.name = "CliError"
    this.hint = hint
  }
}

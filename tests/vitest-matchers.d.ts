import "vitest"

interface SilveryRetryOptions {
  timeout?: number
}

declare module "vitest" {
  interface Assertion<T = any> {
    /**
     * vitest's OWN snapshot matchers, re-declared.
     *
     * They are not ours and we would rather not restate them. vitest declares
     * them by augmenting `@vitest/expect`'s `Assertion`, but `vitest` only
     * RE-EXPORTS that type, so a `declare module "vitest" { interface Assertion }`
     * anywhere in the program mints a fresh, unmerged interface — and the call
     * sites resolve against that one, which carries the custom matchers and none
     * of the built-ins. Both this file and `@termless/test/matchers` augment
     * `"vitest"`, and pointing THIS file at `@vitest/expect` instead does not
     * help while termless still does (measured: still 4 errors), so restoring
     * the two matchers our suite actually calls is the fix that stays inside
     * silvery.
     *
     * Delete these two lines once termless's `declare module "vitest"` block is
     * gone; `tests/examples/dashboard.test.tsx` and
     * `tests/features/selection-cell-semantics.test.tsx` are the call sites that
     * will tell you immediately.
     */
    toMatchSnapshot(snapshot?: unknown, hint?: string): void
    toMatchInlineSnapshot(properties?: unknown, snapshot?: string, hint?: string): void

    toContainText(text: string, options?: SilveryRetryOptions): void
    toHaveText(text: string, options?: SilveryRetryOptions): void
    toMatchLines(lines: string[], options?: SilveryRetryOptions): void
    toContainOutput(text: string, options?: SilveryRetryOptions): void
    toHaveAttrs(attrs: Record<string, unknown>): void
    toBeBold(): void
    toBeItalic(): void
    toBeUnderline(): void
    toBeInverse(): void
    toHaveFg(color: unknown): void
    toHaveBg(color: unknown): void
    toBeInMode(mode: string): void
    toHaveCursor(
      props: { x?: number; y?: number; visible?: boolean; style?: string },
      options?: SilveryRetryOptions,
    ): void
  }

  interface Matchers<T = any> {
    toContainText(text: string, options?: SilveryRetryOptions): void
    toHaveText(text: string, options?: SilveryRetryOptions): void
    toMatchLines(lines: string[], options?: SilveryRetryOptions): void
    toContainOutput(text: string, options?: SilveryRetryOptions): void
    toHaveAttrs(attrs: Record<string, unknown>): void
    toBeBold(): void
    toBeItalic(): void
    toBeUnderline(): void
    toBeInverse(): void
    toHaveFg(color: unknown): void
    toHaveBg(color: unknown): void
    toBeInMode(mode: string): void
    toHaveCursor(
      props: { x?: number; y?: number; visible?: boolean; style?: string },
      options?: SilveryRetryOptions,
    ): void
  }
}

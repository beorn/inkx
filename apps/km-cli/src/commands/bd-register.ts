/* eslint-disable @typescript-eslint/no-explicit-any -- Command's strongly-typed generics make uniform .addCommand variadics unergonomic; same exemption as bd-comment / bd-memory use. */
/**
 * Shared registration-helper types for bd subcommand modules.
 *
 * Each `bd-<verb>.ts` module exports a `registerBdX(parent)` factory that
 * builds its `Command` and calls `parent.addCommand(cmd)`. The parent
 * is loosely typed as `BdRegistrar` — only the surface bd modules
 * actually use, so implementers don't have to thread silvery's full
 * `Command` generic chain.
 *
 * The `any, any, any` generics on `Command` are a lint exception (mirrors
 * the convention in `bd-comment.ts` / `bd-memory.ts`); silvery's
 * `Command<A, O, G>` parametrizes over arg / opt / globalOpt shapes that
 * vary per subcommand, so a uniform "add any subcommand" hook can't pin
 * a stricter type without breaking ergonomics.
 */

import type { Command } from "@silvery/commander"

/** Loose parent type for `register*(parent)` factories — accepts any silvery Command. */
export interface BdRegistrar {
  addCommand: (c: Command<any, any, any>) => unknown
}

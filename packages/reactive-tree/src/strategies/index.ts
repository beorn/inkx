/**
 * Built-in strategy exports.
 *
 * Users select a strategy by passing one of these factories to a DSL method:
 *
 *   tree.descendants(s => s.cursor).some({ strategy: sparse })
 *
 * The engine also uses these as defaults — see `resolveDefaultStrategy`.
 *
 * Writing a custom strategy: implement `Strategy = (ctx) => StrategyInstance`
 * in your own module and pass the factory directly. No engine changes needed.
 */

export { sparse } from "./sparse.ts"
export { walk, walkUp } from "./walk.ts"
export { singleton } from "./singleton.ts"

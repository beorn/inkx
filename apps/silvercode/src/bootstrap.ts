#!/usr/bin/env bun
/**
 * silvercode bootstrap — thin entry that silences loggily output so
 * silvery/loggily warnings don't leak through the alt-screen UI.
 */

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "error"

const { main } = await import("./index.tsx")
await main()
